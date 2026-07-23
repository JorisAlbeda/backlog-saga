import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { embedText } from './embeddings'

export interface CodexEntry {
  name: string
  slug: string
  category: string
  description: string
  history: string
  location: string
}

interface CachedEmbedding {
  hash: string
  vector: number[]
}

const EMBEDDINGS_KEY = 'codex-embeddings.json'
// How many uncached entries to embed at once on a cold start / codex change,
// instead of fully serially — bounded so a big backlog doesn't hammer a
// local Ollama instance with unlimited concurrent requests.
const EMBED_CONCURRENCY = 6
// Query embeddings (todo titles) are unbounded in variety but a stuck todo
// re-queries the same text on every scheduled-task tick — a small bounded
// cache avoids re-embedding it every time.
const QUERY_EMBEDDING_CACHE_LIMIT = 200

interface CodexCache {
  entries: CodexEntry[]
  vectors: Map<string, number[]>
}

// One memoized promise for "the loaded codex, if any." A result that
// resolves cleanly (including a clean `null` from loadCodex's own
// missing/misconfigured-directory check) stays cached for the process's
// life — fixing that requires an env change and a restart anyway. An
// unexpected *failure* to load (a transient fs error, a corrupted cache
// file, etc.) resets this to undefined instead, so the next call retries
// rather than being stuck disabled until a restart.
let cachePromise: Promise<CodexCache | null> | undefined
let lastError: string | undefined

const queryEmbeddingCache = new Map<string, number[]>()

export interface CodexStatus {
  configured: boolean
  entityCount: number
  lastError?: string
}

function codexDir(): string | undefined {
  // Resolved once at config time (nuxt.config.ts), relative to the project
  // root, so this is already absolute (or empty) regardless of the running
  // process's working directory.
  const dir = useRuntimeConfig().codexDir as string
  return dir || undefined
}

function entryKey(entry: Pick<CodexEntry, 'category' | 'slug'>): string {
  return `${entry.category}/${entry.slug}`
}

function hashFor(model: string, raw: string): string {
  return createHash('sha256').update(model).update('\n').update(raw).digest('hex')
}

function parseEntry(category: string, slug: string, text: string): CodexEntry | null {
  const nameMatch = text.match(/^#\s+(.+)$/m)
  if (!nameMatch) return null
  const section = (heading: string) => {
    const match = text.match(new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|\\s*$)`))
    return (match?.[1] ?? '').trim()
  }
  const entry: CodexEntry = {
    name: nameMatch[1].trim(),
    slug,
    category,
    description: section('Description'),
    history: section('History'),
    location: section('Location')
  }
  // The sibling `rag` project's catalogue.ts is the sole writer of this
  // format and always fills these two sections — an empty one here most
  // likely means that project's markdown shape drifted (a renamed heading),
  // not that the entry is legitimately blank.
  if (!entry.description || !entry.history) {
    console.warn(`[codex] ${category}/${slug} is missing an expected Description/History section — the codex markdown format may have changed`)
  }
  return entry
}

// Every codex/<category>/<slug>.md, parsed. Malformed files (no leading
// "# Name" heading) are skipped rather than failing the whole load.
function readCodexFiles(dir: string): Array<{ entry: CodexEntry; raw: string }> {
  const results: Array<{ entry: CodexEntry; raw: string }> = []
  for (const categoryDirent of readdirSync(dir, { withFileTypes: true })) {
    if (!categoryDirent.isDirectory()) continue
    const categoryPath = resolve(dir, categoryDirent.name)
    for (const fileDirent of readdirSync(categoryPath, { withFileTypes: true })) {
      if (!fileDirent.isFile() || !fileDirent.name.endsWith('.md')) continue
      const raw = readFileSync(resolve(categoryPath, fileDirent.name), 'utf-8')
      const slug = fileDirent.name.slice(0, -3)
      const entry = parseEntry(categoryDirent.name, slug, raw)
      if (entry) results.push({ entry, raw })
    }
  }
  return results
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// Embeds only entries whose (model, content) hash changed since the last
// run (new/edited codex files, or a switched embedding model); everything
// else reuses its cached vector from .data/db/codex-embeddings.json. A
// per-entry embed failure drops just that entry from semantic retrieval —
// name/location listing, which doesn't need vectors, still works — and
// isn't persisted, so it's retried on the next load.
async function loadCodex(): Promise<CodexCache | null> {
  const dir = codexDir()
  if (!dir || !existsSync(dir)) return null

  const model = useRuntimeConfig().embeddingModel as string
  const found = readCodexFiles(dir)
  const storage = useStorage('data')
  const cached = (await storage.getItem<Record<string, CachedEmbedding>>(EMBEDDINGS_KEY)) ?? {}
  const nextCached: Record<string, CachedEmbedding> = {}
  const vectors = new Map<string, number[]>()
  const toEmbed: Array<{ entry: CodexEntry; hash: string }> = []

  for (const { entry, raw } of found) {
    const key = entryKey(entry)
    const hash = hashFor(model, raw)
    const existing = cached[key]
    if (existing && existing.hash === hash) {
      vectors.set(key, existing.vector)
      nextCached[key] = existing
    } else {
      toEmbed.push({ entry, hash })
    }
  }

  for (let i = 0; i < toEmbed.length; i += EMBED_CONCURRENCY) {
    const batch = toEmbed.slice(i, i + EMBED_CONCURRENCY)
    await Promise.all(
      batch.map(async ({ entry, hash }) => {
        const key = entryKey(entry)
        try {
          const vector = await embedText(`${entry.name}\n${entry.description}\n${entry.history}`)
          vectors.set(key, vector)
          nextCached[key] = { hash, vector }
        } catch (err) {
          console.warn(`[codex] failed to embed ${key}, excluding it from semantic grounding this run`, err)
        }
      })
    )
  }

  await storage.setItem(EMBEDDINGS_KEY, nextCached)
  return { entries: found.map((f) => f.entry), vectors }
}

async function getCache(): Promise<CodexCache | null> {
  if (!cachePromise) {
    cachePromise = loadCodex().catch((err) => {
      lastError = err instanceof Error ? err.message : String(err)
      console.warn('[codex] failed to load the world codex this attempt, will retry on next use', err)
      cachePromise = undefined
      return null
    })
  }
  return cachePromise
}

async function embedQueryCached(query: string): Promise<number[]> {
  const cached = queryEmbeddingCache.get(query)
  if (cached) return cached
  const vector = await embedText(query)
  if (queryEmbeddingCache.size >= QUERY_EMBEDDING_CACHE_LIMIT) {
    const oldestKey = queryEmbeddingCache.keys().next().value
    if (oldestKey !== undefined) queryEmbeddingCache.delete(oldestKey)
  }
  queryEmbeddingCache.set(query, vector)
  return vector
}

function namesFrom(c: CodexCache): string[] {
  return c.entries.map((e) => e.name)
}

function locationsFrom(c: CodexCache): Array<{ name: string; description: string }> {
  return c.entries.filter((e) => e.category === 'locations').map((e) => ({ name: e.name, description: e.description }))
}

function relevantFrom(c: CodexCache, queryVector: number[], k = 4): CodexEntry[] {
  return c.entries
    .map((entry) => {
      const vector = c.vectors.get(entryKey(entry))
      return vector ? { entry, score: cosineSimilarity(queryVector, vector) } : null
    })
    .filter((x): x is { entry: CodexEntry; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.entry)
}

export async function getCodexStatus(): Promise<CodexStatus> {
  const c = await getCache()
  return {
    configured: Boolean(codexDir()),
    entityCount: c ? c.entries.length : 0,
    ...(lastError ? { lastError } : {})
  }
}

// Assembles everything generateSubtype/generateChronicle need into one
// prompt-ready block. Returns "" (never throws) when codex grounding is
// disabled, unconfigured, or every lookup came back empty.
export async function getWorldCanonContext(query: string): Promise<string> {
  try {
    const c = await getCache()
    if (!c || c.entries.length === 0) return ''

    const names = namesFrom(c)
    const locations = locationsFrom(c)

    let relevant: CodexEntry[] = []
    try {
      const queryVector = await embedQueryCached(query)
      relevant = relevantFrom(c, queryVector)
    } catch (err) {
      console.warn('[codex] failed to embed query, skipping semantic world-context retrieval', err)
    }

    if (names.length === 0 && locations.length === 0 && relevant.length === 0) return ''

    const sections: string[] = []
    if (locations.length > 0) {
      sections.push(`Known locations in this world:\n${locations.map((l) => `- ${l.name}: ${l.description}`).join('\n')}`)
    }
    if (relevant.length > 0) {
      sections.push(
        `Existing canon most relevant to this task:\n${relevant.map((e) => `- ${e.name} (${e.category}): ${e.description}`).join('\n')}`
      )
    }
    if (names.length > 0) {
      sections.push(`All existing named entities, for reference: ${names.join(', ')}`)
    }

    return `\n\nEXISTING WORLD CANON — treat everything below as established fact from prior play, for context only. Do not copy this text verbatim, and do not invent a name that duplicates or contradicts it. Where it fits naturally, tie your invention to an existing location rather than a new one.\n${sections.join(
      '\n\n'
    )}\n`
  } catch (err) {
    console.warn('[codex] failed to assemble world-canon context, proceeding without it', err)
    return ''
  }
}

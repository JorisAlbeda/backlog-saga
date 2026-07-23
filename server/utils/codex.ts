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

interface CodexCache {
  entries: CodexEntry[]
  vectors: Map<string, number[]>
}

// Lazily built once per process and reused for its lifetime. A failed load
// (missing/misconfigured codexDir) is cached as `null` rather than retried —
// fixing that requires an env change, which requires a restart anyway.
let cache: CodexCache | null | undefined
let loading: Promise<CodexCache | null> | undefined

function codexDir(): string | undefined {
  const dir = useRuntimeConfig().codexDir as string
  return dir ? resolve(dir) : undefined
}

function entryKey(entry: Pick<CodexEntry, 'category' | 'slug'>): string {
  return `${entry.category}/${entry.slug}`
}

function parseEntry(category: string, slug: string, text: string): CodexEntry | null {
  const nameMatch = text.match(/^#\s+(.+)$/m)
  if (!nameMatch) return null
  const section = (heading: string) => {
    const match = text.match(new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|\\s*$)`))
    return (match?.[1] ?? '').trim()
  }
  return {
    name: nameMatch[1].trim(),
    slug,
    category,
    description: section('Description'),
    history: section('History'),
    location: section('Location')
  }
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

// Embeds only entries whose content hash changed since the last run (new or
// edited codex files); everything else reuses its cached vector from
// .data/db/codex-embeddings.json. A per-entry embed failure (e.g. the
// embedding model isn't pulled) drops just that entry from semantic
// retrieval — name/location listing, which doesn't need vectors, still works.
async function loadCodex(): Promise<CodexCache | null> {
  const dir = codexDir()
  if (!dir || !existsSync(dir)) return null

  const found = readCodexFiles(dir)
  const storage = useStorage('data')
  const cached = (await storage.getItem<Record<string, CachedEmbedding>>(EMBEDDINGS_KEY)) ?? {}
  const nextCached: Record<string, CachedEmbedding> = {}
  const vectors = new Map<string, number[]>()

  for (const { entry, raw } of found) {
    const key = entryKey(entry)
    const hash = createHash('sha256').update(raw).digest('hex')
    const existing = cached[key]
    if (existing && existing.hash === hash) {
      vectors.set(key, existing.vector)
      nextCached[key] = existing
      continue
    }
    try {
      const vector = await embedText(`${entry.name}\n${entry.description}\n${entry.history}`)
      vectors.set(key, vector)
      nextCached[key] = { hash, vector }
    } catch (err) {
      console.warn(`[codex] failed to embed ${key}, excluding it from semantic grounding this run`, err)
    }
  }

  await storage.setItem(EMBEDDINGS_KEY, nextCached)
  return { entries: found.map((f) => f.entry), vectors }
}

async function getCache(): Promise<CodexCache | null> {
  if (cache !== undefined) return cache
  if (!loading) {
    loading = loadCodex()
      .then((result) => {
        cache = result
        return result
      })
      .catch((err) => {
        console.warn('[codex] failed to load the world codex, grounding disabled for this process', err)
        cache = null
        return null
      })
  }
  return loading
}

export async function getAllEntityNames(): Promise<string[]> {
  const c = await getCache()
  return c ? c.entries.map((e) => e.name) : []
}

export async function getLocationSummaries(): Promise<Array<{ name: string; description: string }>> {
  const c = await getCache()
  if (!c) return []
  return c.entries
    .filter((e) => e.category === 'locations')
    .map((e) => ({ name: e.name, description: e.description }))
}

export async function getRelevantEntries(query: string, k = 4): Promise<CodexEntry[]> {
  const c = await getCache()
  if (!c || c.entries.length === 0) return []

  let queryVector: number[]
  try {
    queryVector = await embedText(query)
  } catch (err) {
    console.warn('[codex] failed to embed query, skipping semantic world-context retrieval', err)
    return []
  }

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

// Assembles everything generateSubtype/generateChronicle need into one
// prompt-ready block. Returns "" (never throws) when codex grounding is
// disabled, unconfigured, or every lookup came back empty.
export async function getWorldCanonContext(query: string): Promise<string> {
  try {
    const [names, locations, relevant] = await Promise.all([
      getAllEntityNames(),
      getLocationSummaries(),
      getRelevantEntries(query)
    ])
    if (names.length === 0 && locations.length === 0 && relevant.length === 0) return ''

    const sections: string[] = []
    if (locations.length > 0) {
      sections.push(
        `Known locations in this world:\n${locations.map((l) => `- ${l.name}: ${l.description}`).join('\n')}`
      )
    }
    if (relevant.length > 0) {
      sections.push(
        `Existing canon most relevant to this task:\n${relevant
          .map((e) => `- ${e.name} (${e.category}): ${e.description}`)
          .join('\n')}`
      )
    }
    if (names.length > 0) {
      sections.push(`All existing named entities, for reference: ${names.join(', ')}`)
    }

    return `\n\nEXISTING WORLD CANON — treat everything below as established fact from prior play. Do not invent a name that duplicates or contradicts it. Where it fits naturally, tie your invention to an existing location rather than a new one.\n${sections.join(
      '\n\n'
    )}\n`
  } catch (err) {
    console.warn('[codex] failed to assemble world-canon context, proceeding without it', err)
    return ''
  }
}

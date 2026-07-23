import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Category } from '../../shared/types'
import { getExistingSlugs, invalidateCodexCache } from './codex'

const GENERATED_CODEX_DIR = resolve(process.cwd(), 'generated-codex')
const MANIFEST_PATH = resolve(GENERATED_CODEX_DIR, 'manifest.json')

// Which codex category a generated entity belongs to. home-improvement and
// communication-admin map onto an exact codex category; cleaning,
// creation-inspiration, and health have no exact fit in rag's fixed
// buildings/characters/events/locations/relics taxonomy — relics and
// events are the closest available buckets, not a precise match.
const CODEX_CATEGORY_FOR: Record<Category, string> = {
  'home-improvement': 'buildings',
  'communication-admin': 'characters',
  cleaning: 'relics',
  'creation-inspiration': 'relics',
  health: 'events'
}

export function codexCategoryFor(category: Category): string {
  return CODEX_CATEGORY_FOR[category]
}

interface ManifestEntry {
  slug: string
  category: string
  name: string
  todoId: string
  generatedAt: string
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readManifest(): ManifestEntry[] {
  if (!existsSync(MANIFEST_PATH)) return []
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
  } catch {
    return []
  }
}

function formatEntry(name: string, description: string, history: string, location: string): string {
  return `# ${name}\n\n## Description\n${description}\n\n## History\n${history}\n\n## Location\n${location}\n`
}

export interface WriteBackInput {
  todoId: string
  category: Category
  resultName: string
  description: string
  history: string
  location: string
}

// Best-effort: writes a new codex-shaped entry for a freshly chronicled
// todo. Never throws — a failure here must not affect the todo's own
// chronicled state, since the chronicle.json/world-material.md records
// (already written by the time this runs) are the primary durable record
// of what happened, not this.
export async function writeGeneratedCodexEntry(input: WriteBackInput): Promise<void> {
  try {
    const codexCategory = CODEX_CATEGORY_FOR[input.category]
    const slug = slugify(input.resultName)
    if (!slug) {
      console.warn(`[generatedCodex] could not derive a slug from "${input.resultName}", skipping write-back`)
      return
    }

    const existingSlugs = await getExistingSlugs(codexCategory)
    if (existingSlugs.has(slug)) {
      console.warn(
        `[generatedCodex] "${input.resultName}" (${codexCategory}/${slug}) already exists in the codex, skipping write-back to avoid overwriting it`
      )
      return
    }

    const categoryDir = resolve(GENERATED_CODEX_DIR, codexCategory)
    mkdirSync(categoryDir, { recursive: true })
    writeFileSync(resolve(categoryDir, `${slug}.md`), formatEntry(input.resultName, input.description, input.history, input.location), 'utf-8')

    const manifest = readManifest()
    manifest.push({
      slug,
      category: codexCategory,
      name: input.resultName,
      todoId: input.todoId,
      generatedAt: new Date().toISOString()
    })
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')

    invalidateCodexCache()
  } catch (err) {
    console.warn(`[generatedCodex] failed to write back a codex entry for "${input.resultName}"`, err)
  }
}

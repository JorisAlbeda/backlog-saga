import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Category } from '../../shared/types'
import { getCodexDir, getExistingSlugs, invalidateCodexCache } from './codex'

// Which codex category a generated entity belongs to. home-improvement and
// communication-admin map onto an exact codex category; cleaning,
// creation-inspiration, and health have no exact fit in the codex's fixed
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function formatEntry(name: string, description: string, history: string, location: string): string {
  return `# ${name}\n\n## Description\n${description}\n\n## History\n${history}\n\n## Location\n${location}\n`
}

export interface WriteBackInput {
  category: Category
  resultName: string
  description: string
  history: string
  location: string
}

// Best-effort: writes a new entry directly into the shared codex (the same
// directory rag's catalogue.ts populates and codex.ts reads), so it becomes
// part of the one shared source of truth all three consuming apps ground
// against. Never throws — a failure here must not affect the todo's own
// chronicled state, since chronicle.json/world-material.md (already written
// by the time this runs) are the durable record of what happened, not this.
// Which entity a given todo produced is already recoverable from
// chronicle.json, so no separate bookkeeping file is kept here.
export async function writeCodexEntry(input: WriteBackInput): Promise<void> {
  try {
    const dir = getCodexDir()
    if (!dir) {
      console.warn('[codexWriteBack] CODEX_DIR is not configured, skipping write-back')
      return
    }

    const codexCategory = CODEX_CATEGORY_FOR[input.category]
    const slug = slugify(input.resultName)
    if (!slug) {
      console.warn(`[codexWriteBack] could not derive a slug from "${input.resultName}", skipping write-back`)
      return
    }

    const existingSlugs = await getExistingSlugs(codexCategory)
    if (existingSlugs.has(slug)) {
      console.warn(
        `[codexWriteBack] "${input.resultName}" (${codexCategory}/${slug}) already exists in the codex, skipping write-back to avoid overwriting it`
      )
      return
    }

    const categoryDir = resolve(dir, codexCategory)
    mkdirSync(categoryDir, { recursive: true })
    writeFileSync(resolve(categoryDir, `${slug}.md`), formatEntry(input.resultName, input.description, input.history, input.location), 'utf-8')

    invalidateCodexCache()
  } catch (err) {
    console.warn(`[codexWriteBack] failed to write back a codex entry for "${input.resultName}"`, err)
  }
}

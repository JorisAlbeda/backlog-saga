import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Category } from '../../shared/types'
import { codexDir, getExistingSlugs, invalidateCodexCache } from './codex'

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
  // Already mapped via codexCategoryFor() by the caller (which needs the
  // same value for generateCodexEntry too) — passed pre-computed rather
  // than re-derived here from a raw Category.
  codexCategory: string
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
// Returns whether a file was actually written, since chronicle.json records
// intent unconditionally and can't otherwise distinguish "this became a
// real codex entry" from "this was skipped or failed."
export async function writeCodexEntry(input: WriteBackInput): Promise<boolean> {
  try {
    const dir = codexDir()
    if (!dir) {
      console.warn('[codexWriteBack] CODEX_DIR is not configured, skipping write-back')
      return false
    }

    const slug = slugify(input.resultName)
    if (!slug) {
      console.warn(`[codexWriteBack] could not derive a slug from "${input.resultName}", skipping write-back`)
      return false
    }

    const existingSlugs = await getExistingSlugs(input.codexCategory)
    if (existingSlugs.has(slug)) {
      console.warn(
        `[codexWriteBack] "${input.resultName}" (${input.codexCategory}/${slug}) already exists in the codex, skipping write-back to avoid overwriting it`
      )
      return false
    }

    const categoryDir = resolve(dir, input.codexCategory)
    mkdirSync(categoryDir, { recursive: true })
    const content = formatEntry(input.resultName, input.description, input.history, input.location)
    try {
      // Exclusive create ('wx'): fails instead of silently overwriting if
      // another writer (a second Backlog Saga process, rag's own
      // catalogue.ts, or the planned Oath Simulator) creates the same slug
      // between the existence check above and this write — the shared
      // codex has no cross-process lock, so this keeps that race's failure
      // mode loud instead of a silent data loss.
      writeFileSync(resolve(categoryDir, `${slug}.md`), content, { encoding: 'utf-8', flag: 'wx' })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        console.warn(`[codexWriteBack] lost a race writing "${input.resultName}" (${input.codexCategory}/${slug}) — another writer created it first, skipping`)
        return false
      }
      throw err
    }

    invalidateCodexCache()
    return true
  } catch (err) {
    console.warn(`[codexWriteBack] failed to write back a codex entry for "${input.resultName}"`, err)
    return false
  }
}

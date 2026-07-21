import type { Category } from './types'

// Per-faction display/behavior config, shared by client and server. LLM
// prompt text stays server-only (see server/utils/ollama.ts) — this file
// only holds what the UI renders and the deterministic copy templates.
export interface FactionConfig {
  factionName: string
  // <select> option text on the Add/Edit Task form.
  selectLabel: string
  // The generic noun for what this faction produces.
  noun: string
  // Instant, deterministic "commission received" text, set at creation —
  // shown before the AI has inferred a subtype.
  initTemplate: string
  // Taking-shape flavor once the AI subtype is known — a glimpse of what's
  // to come, and the fallback text if the final chronicle can't be
  // generated because Ollama is offline.
  draftedTemplate(subtype: string): string
  // UI eyebrow caption on the dispatch card / dispatch page header.
  dispatchLabel: string
  // Past-tense verb for the "done" summary line, e.g. "{name} - Built".
  doneVerb: string
  // Label for the secondary detail field (material/medium/origin/...),
  // used in the LLM prompt and in world-material.md.
  detailLabel: string
}

export const FACTIONS: Record<Category, FactionConfig> = {
  'home-improvement': {
    factionName: 'Construction Guild',
    selectLabel: 'Home Improvement',
    noun: 'building',
    initTemplate: 'The Construction Guild is building.',
    draftedTemplate: subtype => `By Imperial order, the Construction Guild is building a ${subtype}.`,
    dispatchLabel: 'Guild Dispatch',
    doneVerb: 'Built',
    detailLabel: 'Material'
  },
  cleaning: {
    factionName: 'The Archivists',
    selectLabel: 'Cleaning',
    noun: 'document',
    initTemplate: 'The Archivists have logged this commission and begin their search.',
    draftedTemplate: subtype => `The Archivists have traced the signs of ${subtype} and begun its recovery.`,
    dispatchLabel: "Archivists' Report",
    doneVerb: 'Recovered',
    detailLabel: 'Medium'
  },
  'communication-admin': {
    factionName: 'The Tavern',
    selectLabel: 'Communication & Admin',
    noun: 'character',
    initTemplate: 'Word of this commission has reached the Tavern.',
    draftedTemplate: subtype => `Word is spreading of ${subtype} soon to take a seat at the Tavern.`,
    dispatchLabel: 'Tavern Tale',
    doneVerb: 'Introduced',
    detailLabel: 'Origin'
  },
  'creation-inspiration': {
    factionName: 'The Mage Tower',
    selectLabel: 'Creation & Inspiration',
    noun: 'spell',
    initTemplate: 'The Mage Tower has taken up this working.',
    draftedTemplate: subtype => `The Mage Tower has begun weaving ${subtype}.`,
    dispatchLabel: 'Tower Missive',
    doneVerb: 'Created',
    detailLabel: 'School'
  },
  health: {
    factionName: "The Healer's Temple",
    selectLabel: 'Health',
    noun: 'piece of lore',
    initTemplate: "The Healer's Temple has begun its recollection.",
    draftedTemplate: subtype => `The Healer's Temple is piecing together ${subtype}.`,
    dispatchLabel: 'Temple Chronicle',
    doneVerb: 'Recalled',
    detailLabel: 'Source'
  }
}

export const CATEGORIES = Object.keys(FACTIONS) as Category[]

// category is a fixed union at the type level, but data read back from disk
// (pre-migration rows, or any other way an invalid value reaches here) isn't
// guaranteed to match at runtime — this falls back instead of throwing, so
// one bad record can't take down a whole list render or resolution pass.
const FALLBACK_FACTION: FactionConfig = {
  factionName: 'Unknown Faction',
  selectLabel: 'Unknown',
  noun: 'thing',
  initTemplate: 'Work has begun.',
  draftedTemplate: subtype => `Something is taking shape: ${subtype}.`,
  dispatchLabel: 'Dispatch',
  doneVerb: 'Finished',
  detailLabel: 'Detail'
}

export function getFaction(category: string): FactionConfig {
  return (FACTIONS as Record<string, FactionConfig>)[category] ?? FALLBACK_FACTION
}

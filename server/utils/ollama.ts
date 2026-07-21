import type { Category } from '../../shared/types'
import { FACTIONS } from '../../shared/factions'

interface SubtypeResult {
  subtype: string
}

interface ChronicleResult {
  resultName: string
  resultDetail: string
  dispatch: string
}

function ollamaConfig() {
  const config = useRuntimeConfig()
  return { url: config.ollamaBaseUrl as string, model: config.ollamaModel as string }
}

// Defense in depth: think:false should stop <think> blocks at the source,
// but strip any that slip through anyway so they can never reach stored text.
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

export async function isOllamaReachable(): Promise<boolean> {
  const { url } = ollamaConfig()
  try {
    await $fetch(`${url}/api/tags`, { method: 'GET', timeout: 2000 })
    return true
  } catch {
    return false
  }
}

async function chatJSON<T>(system: string, prompt: string): Promise<T> {
  const { url, model } = ollamaConfig()
  const response = await $fetch<{ message: { content: string } }>(`${url}/api/chat`, {
    method: 'POST',
    timeout: 30000,
    body: {
      model,
      think: false,
      format: 'json',
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ]
    }
  })
  const content = stripThink(response.message.content)
  return JSON.parse(content) as T
}

// The bits of prompt text that vary per faction, on top of the shared
// display config in shared/factions.ts (factionName/noun/doneVerb/
// detailLabel). One template builds both prompts for every faction from
// this table instead of five hand-written prompt pairs.
interface FactionVoice {
  persona: string
  register: string
  subtypeVerb: string
  subtypeExamples: string[]
}

const FACTION_VOICES: Record<Category, FactionVoice> = {
  'home-improvement': {
    persona: 'the record-keeper for the Construction Guild',
    register: 'fantasy-guild',
    subtypeVerb: 'raise',
    subtypeExamples: ['church', 'aqueduct', 'watchtower', 'granary']
  },
  cleaning: {
    persona: "an Archivist cataloguing recovered documents for a fantasy world's Archive",
    register: 'fantasy-archive',
    subtypeVerb: 'recover',
    subtypeExamples: ['ledger', 'treaty', "cartographer's map", 'private letter']
  },
  'communication-admin': {
    persona: 'the loremaster of a fantasy tavern',
    register: 'fantasy-tavern',
    subtypeVerb: 'welcome',
    subtypeExamples: ['a traveling merchant', 'a retired duelist', 'the town crier']
  },
  'creation-inspiration': {
    persona: 'an archmage of the Mage Tower',
    register: 'fantasy-arcane',
    subtypeVerb: 'create',
    subtypeExamples: ['a nature ritual', 'an illusion', 'a protective ward']
  },
  health: {
    persona: 'a healer of the Temple',
    register: 'fantasy-temple',
    subtypeVerb: 'recall',
    subtypeExamples: ["a forgotten remedy", 'an old legend', "a herbalist's rite"]
  }
}

function voiceFor(category: Category): string {
  return `You are ${FACTION_VOICES[category].persona}, writing entries for a tabletop RPG chronicle. Respond ONLY with strict JSON, no commentary, no markdown fences.`
}

function subtypePromptFor(category: Category, title: string): string {
  const faction = FACTIONS[category]
  const { subtypeVerb, subtypeExamples } = FACTION_VOICES[category]
  const examples = subtypeExamples.map(example => `"${example}"`).join(', ')
  return `A task has been logged: "${title}". In one short phrase, name the type of ${faction.noun} the ${faction.factionName} would ${subtypeVerb} in tribute to this task (e.g. ${examples}). Respond as JSON: {"subtype": "..."}.`
}

function chroniclePromptFor(category: Category, title: string, subtype: string): string {
  const faction = FACTIONS[category]
  const { register } = FACTION_VOICES[category]
  return `A real-world task was completed: "${title}". The ${faction.factionName} ${faction.doneVerb.toLowerCase()} ${subtype} in tribute to it. Invent a fitting proper name for the ${faction.noun}, its ${faction.detailLabel.toLowerCase()}, and write a short (2-4 sentence) in-character dispatch about it, in a ${register} register. The dispatch should thematically resemble the task without literally repeating its wording. Respond as JSON: {"resultName": "...", "resultDetail": "...", "dispatch": "..."}.`
}

export async function generateSubtype(title: string, category: Category): Promise<SubtypeResult> {
  const result = await chatJSON<SubtypeResult>(voiceFor(category), subtypePromptFor(category, title))
  if (typeof result?.subtype !== 'string' || !result.subtype.trim()) {
    throw new Error(`generateSubtype: model response missing a usable "subtype" string for category ${category}`)
  }
  return result
}

export async function generateChronicle(title: string, category: Category, subtype: string): Promise<ChronicleResult> {
  const result = await chatJSON<ChronicleResult>(voiceFor(category), chroniclePromptFor(category, title, subtype))
  const fields = [result?.resultName, result?.resultDetail, result?.dispatch]
  if (fields.some(f => typeof f !== 'string' || !f.trim())) {
    throw new Error(`generateChronicle: model response missing a usable resultName/resultDetail/dispatch string for category ${category}`)
  }
  return result
}

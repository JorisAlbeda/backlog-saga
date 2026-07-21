interface CategoryResult {
  category: string
}

interface ChronicleResult {
  buildingName: string
  material: string
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

const GUILD_VOICE =
  'You are the record-keeper for the Construction Guild in a fantasy world, writing entries for a tabletop RPG chronicle. Respond ONLY with strict JSON, no commentary, no markdown fences.'

export async function generateCategory(title: string): Promise<CategoryResult> {
  const result = await chatJSON<CategoryResult>(
    GUILD_VOICE,
    `A real-world task was just completed: "${title}". In one word or short phrase, name the type of building the Construction Guild would raise in tribute to this task (e.g. "church", "aqueduct", "watchtower", "granary"). Respond as JSON: {"category": "..."}.`
  )
  if (typeof result?.category !== 'string' || !result.category.trim()) {
    throw new Error('generateCategory: model response missing a usable "category" string')
  }
  return result
}

export async function generateChronicle(title: string, category: string): Promise<ChronicleResult> {
  const result = await chatJSON<ChronicleResult>(
    GUILD_VOICE,
    `A real-world task was completed: "${title}". The Construction Guild has finished building a ${category} in tribute to it. Invent a fitting proper name for the building, the material it's built from, and write a short (2-4 sentence) in-character dispatch announcing its completion, in a fantasy-guild register. The dispatch should thematically resemble the task without literally repeating its wording. Respond as JSON: {"buildingName": "...", "material": "...", "dispatch": "..."}.`
  )
  const fields = [result?.buildingName, result?.material, result?.dispatch]
  if (fields.some(f => typeof f !== 'string' || !f.trim())) {
    throw new Error('generateChronicle: model response missing a usable buildingName/material/dispatch string')
  }
  return result
}

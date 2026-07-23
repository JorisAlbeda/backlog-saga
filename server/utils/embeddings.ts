// Split out from ollama.ts so codex.ts (which needs embeddings) and ollama.ts
// (which needs codex.ts for world-canon grounding) don't import each other.
export async function embedText(text: string): Promise<number[]> {
  const config = useRuntimeConfig()
  const url = config.ollamaBaseUrl as string
  const model = config.embeddingModel as string
  const response = await $fetch<{ embedding: number[] }>(`${url}/api/embeddings`, {
    method: 'POST',
    timeout: 15000,
    body: { model, prompt: text }
  })
  if (!Array.isArray(response?.embedding) || response.embedding.length === 0) {
    throw new Error('embedText: Ollama response did not include a usable "embedding" array')
  }
  return response.embedding
}

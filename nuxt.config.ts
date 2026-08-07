import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved here, against this config file's own directory, rather than at
// server runtime — process.cwd() at runtime isn't guaranteed to be the
// project root (a built Nitro server can be started from any working
// directory), so resolving a relative CODEX_DIR at request time would
// silently point at the wrong path in that case.
const rootDir = fileURLToPath(new URL('.', import.meta.url))

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/tokens.css'],
  runtimeConfig: {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    // Path to the world codex (the `codex/` folder produced by the sibling
    // `rag` project's `catalogue.ts`), relative to this file. Empty disables
    // codex grounding.
    codexDir: process.env.CODEX_DIR ? resolve(rootDir, process.env.CODEX_DIR) : ''
  },
  nitro: {
    experimental: { tasks: true },
    scheduledTasks: {
      '* * * * *': ['guild:resolve']
    },
    storage: {
      // Overridable so test runs can point storage at an isolated temp
      // directory instead of the real .data/db — same pattern as CODEX_DIR
      // above, resolved once here against this file's own directory.
      data: { driver: 'fs', base: process.env.DATA_DIR ? resolve(rootDir, process.env.DATA_DIR) : './.data/db' }
    }
  }
})

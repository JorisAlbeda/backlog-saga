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
  modules: ['@vite-pwa/nuxt'],
  // The installed app must open from the service worker's cache with zero
  // connectivity, so it can't rely on a fresh server render — see
  // docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md.
  routeRules: {
    '/': { ssr: false }
  },
  pwa: {
    strategies: 'injectManifest',
    // Nuxt 4's default directory structure resolves the Vite client build's
    // `root` to `<rootDir>/app`, and @vite-pwa/nuxt resolves this srcDir
    // against that root (not the project root) — so this must climb back out
    // of `app/` to reach the project-root-level `service-worker/` directory.
    srcDir: '../service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    devOptions: { enabled: true, type: 'module' },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico}']
    },
    manifest: {
      name: 'Backlog Saga',
      short_name: 'Backlog Saga',
      description: 'A fantasy-themed todo ledger',
      start_url: '/',
      display: 'standalone',
      background_color: '#f5efe3',
      theme_color: '#1b2a4a',
      icons: [
        { src: '/favicon.png', sizes: '72x72', type: 'image/png' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
      ]
    }
  },
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

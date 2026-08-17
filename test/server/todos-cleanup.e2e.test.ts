import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Todo } from '../../shared/types'

const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))
process.env.DATA_DIR = dataDir

// dev: true — the /_nitro/tasks/:name invocation endpoint this test hits is
// registered only by Nitro's dev-server runtime; it's absent from the
// production build @nuxt/test-utils' setup() otherwise runs. The daily
// schedule itself (nuxt.config.ts scheduledTasks) is unaffected — Nitro's
// production preset starts its own schedule runner independently of this
// endpoint, so this is a test-harness concern only, not a real dev/prod gap.
//
// The "TODO_RETENTION_DAYS=0 disables cleanup" scenario described in the
// plan (setting the env var mid-test, after this setup() call) can't
// actually be exercised this way: nuxt.config.ts bakes TODO_RETENTION_DAYS
// into runtimeConfig once, at this dev server's boot, which runs as a
// separate OS process — mutating process.env afterwards in the test
// process never reaches it. Booting a second differently-configured dev
// server (another file, or a mid-file restart) was tried and is unreliable
// in this environment: Nuxt's dev-server lock/HMR socket are keyed
// per-buildDir/fixed-port, and tearing down a dev server started via `nuxi
// _dev` (which itself spawns a nested worker process) doesn't reliably
// free that lock before the next one starts, so a second boot intermittently
// fails with "Another Nuxt dev server is already running" or a leaked
// process. That scenario is instead covered directly against
// deleteOldDoneTodos — see todos-cleanup-disabled.test.ts.
await setup({ dev: true })

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

// Todos are seeded by writing todos.json directly into the isolated
// DATA_DIR rather than via the API: reaching guildStatus: 'chronicled'
// normally requires a live Ollama, which isn't available in this test
// environment, and completedAt needs to be backdated to simulate age,
// which no API endpoint supports.
function fixtureTodo(overrides: Partial<Todo> & { id: string }): Todo {
  return {
    title: 'Fixture todo',
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
    category: 'cleaning',
    guildStatus: 'init',
    text: { init: 'placeholder' },
    chronicleWritten: false,
    version: 1,
    ...overrides
  }
}

describe('todos:cleanup task', () => {
  it('removes only Done todos older than the retention window, leaving everything else', async () => {
    const now = Date.now()
    const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString()

    const oldDone = fixtureTodo({
      id: 'old-done',
      completedAt: daysAgo(10),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    const recentDone = fixtureTodo({
      id: 'recent-done',
      completedAt: daysAgo(2),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    const oldTakingShape = fixtureTodo({
      id: 'old-taking-shape',
      completedAt: daysAgo(10),
      guildStatus: 'drafted',
      chronicleWritten: false
    })
    const oldTodo = fixtureTodo({
      id: 'old-todo',
      completedAt: null,
      guildStatus: 'init'
    })

    writeFileSync(join(dataDir, 'todos.json'), JSON.stringify([oldDone, recentDone, oldTakingShape, oldTodo]))

    const response = await $fetch<{ removed: number }>('/_nitro/tasks/todos:cleanup', { method: 'POST' })
    expect(response.removed).toBe(1)

    const remaining = await $fetch<Todo[]>('/api/todos')
    expect(remaining.map(t => t.id).sort()).toEqual(['old-taking-shape', 'old-todo', 'recent-done'])
  })
})

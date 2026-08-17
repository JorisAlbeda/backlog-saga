import { describe, it, expect } from 'vitest'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Todo } from '../../shared/types'

// Exercises deleteOldDoneTodos (server/utils/store.ts) against a real
// unstorage fs driver, without a running Nitro server. server/utils/store.ts
// resolves storage via the Nitro-auto-imported `useStorage` global, which
// only exists inside a running Nitro process. An earlier version of this
// test spun up a real dev-mode Nitro server (`setup({ dev: true })`) to get
// one, via the only HTTP route Nitro exposes for manually invoking a
// scheduled task (`/_nitro/tasks/:name`, dev-runtime only — confirmed
// against node_modules/nitropack's dev vs. production presets). That dev
// server reliably leaked an orphaned `nuxi _dev` child process on Windows,
// which made the *next* `npm test` invocation fail. Stubbing the one global
// store.ts actually needs — backed by a real fs driver, not a mock — gets
// the same real-storage coverage with no server process involved at all.
const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))
const storage = createStorage({ driver: fsDriver({ base: dataDir }) })
;(globalThis as any).useStorage = () => storage

// Dynamic import, after the stub above is in place — server/utils/store.ts
// must not be statically imported (and therefore evaluated) before
// globalThis.useStorage exists.
const { deleteOldDoneTodos } = await import('../../server/utils/store')

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

describe('deleteOldDoneTodos', () => {
  it('removes only Done todos older than the retention window, leaving everything else', async () => {
    const now = Date.now()
    const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString()

    const oldDone = fixtureTodo({ id: 'old-done', completedAt: daysAgo(10), guildStatus: 'chronicled', chronicleWritten: true })
    const recentDone = fixtureTodo({ id: 'recent-done', completedAt: daysAgo(2), guildStatus: 'chronicled', chronicleWritten: true })
    const oldTakingShape = fixtureTodo({ id: 'old-taking-shape', completedAt: daysAgo(10), guildStatus: 'drafted', chronicleWritten: false })
    const oldTodo = fixtureTodo({ id: 'old-todo', completedAt: null, guildStatus: 'init' })

    await storage.setItem('todos.json', [oldDone, recentDone, oldTakingShape, oldTodo])

    const removed = await deleteOldDoneTodos(7)
    expect(removed).toBe(1)

    const remaining = await storage.getItem<Todo[]>('todos.json')
    expect(remaining!.map(t => t.id).sort()).toEqual(['old-taking-shape', 'old-todo', 'recent-done'])
  })

  it('returns 0 without touching storage when retentionDays is 0', async () => {
    const veryOldDone = fixtureTodo({
      id: 'very-old-done',
      completedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    await storage.setItem('todos.json', [veryOldDone])

    await expect(deleteOldDoneTodos(0)).resolves.toBe(0)

    const remaining = await storage.getItem<Todo[]>('todos.json')
    expect(remaining!.map(t => t.id)).toEqual(['very-old-done'])
  })

  it('returns 0 without touching storage when retentionDays is negative', async () => {
    await expect(deleteOldDoneTodos(-1)).resolves.toBe(0)
  })
})

import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drainActions } from '../../app/utils/drainQueue'
import type { PendingAction } from '../../app/utils/offlineQueue'
import type { Todo, TodoNotFound } from '../../shared/types'
import { isTodoNotFound } from '../../shared/types'

// Exercises the real seam between drainActions (app/utils/drainQueue.ts)
// and the actual idempotent API endpoints, via a real running test server
// (as opposed to test/utils/drainQueue.test.ts, which only exercises the
// pure orchestration logic against a fake `replay`). This is the area
// where the final-review fixes to startPolling()/refresh() apply, and it
// directly verifies the applied-vs-discarded distinction end to end.
//
// `replay` below mirrors `replayAction` in app/composables/useTodos.ts
// case-for-case (that composable can't be imported directly into a plain
// Vitest test — it relies on Nuxt's auto-imported `useState`/`$fetch`
// runtime context). Keep this in sync if replayAction's cases change.
async function replay(action: PendingAction): Promise<'applied' | 'discarded'> {
  switch (action.type) {
    case 'create':
      await $fetch('/api/todos', {
        method: 'POST',
        body: { id: action.tempId, title: action.title, category: action.category }
      })
      return 'applied'
    case 'patch': {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${action.id}`, {
        method: 'PATCH',
        body: { title: action.title, category: action.category }
      })
      return isTodoNotFound(result) ? 'discarded' : 'applied'
    }
    case 'complete':
    case 'reopen': {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${action.id}`, {
        method: 'PATCH',
        body: { action: action.type }
      })
      return isTodoNotFound(result) ? 'discarded' : 'applied'
    }
    case 'delete':
      await $fetch(`/api/todos/${action.id}`, { method: 'DELETE' })
      return 'applied'
  }
}

function describeAction(action: PendingAction): string {
  const target = action.type === 'create' ? action.title : action.id
  return `${action.type} (${target})`
}

const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))
process.env.DATA_DIR = dataDir

await setup()

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('drainActions against the real idempotent API', () => {
  it('applies a create and a patch, discards a complete on an already-deleted todo, and leaves the server in the expected end state', async () => {
    // Set up server-side state the queued actions will act against.
    const toPatch = await $fetch<Todo>('/api/todos', {
      method: 'POST',
      body: { title: 'Existing todo to patch', category: 'cleaning' }
    })
    const toDelete = await $fetch<Todo>('/api/todos', {
      method: 'POST',
      body: { title: 'Existing todo to delete first', category: 'health' }
    })
    await $fetch(`/api/todos/${toDelete.id}`, { method: 'DELETE' })

    const actions: PendingAction[] = [
      { type: 'create', tempId: 'offline-create-1', title: 'Queued offline create', category: 'home-improvement', status: 'pending' },
      { type: 'patch', id: toPatch.id, title: 'Patched offline', status: 'pending' },
      // toDelete no longer exists server-side — this must resolve as a
      // 2xx "not-found" discard, not a failure, and must not resurrect it.
      { type: 'complete', id: toDelete.id, status: 'pending' }
    ]

    const result = await drainActions(actions, replay, describeAction)

    expect(result.stoppedEarly).toBe(false)
    expect(result.remaining).toEqual([])
    expect(result.failedMessages).toEqual([])
    expect(result.resolvedMessages).toEqual([
      'Synced: create (Queued offline create)',
      `Synced: patch (${toPatch.id})`,
      `Discarded: complete (${toDelete.id}) — that task was deleted`
    ])

    const all = await $fetch<Todo[]>('/api/todos')

    const created = all.find(t => t.id === 'offline-create-1')
    expect(created).toBeDefined()
    expect(created?.title).toBe('Queued offline create')
    expect(created?.category).toBe('home-improvement')

    const patched = all.find(t => t.id === toPatch.id)
    expect(patched?.title).toBe('Patched offline')

    // The discarded complete must not have resurrected the deleted todo.
    expect(all.find(t => t.id === toDelete.id)).toBeUndefined()
  })
})

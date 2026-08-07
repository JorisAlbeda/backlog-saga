// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadQueue,
  saveQueue,
  enqueueAction,
  applyActionOptimistically,
  isNetworkFailure,
  type PendingAction
} from '../../app/utils/offlineQueue'
import type { Todo } from '../../shared/types'

beforeEach(() => {
  localStorage.clear()
})

describe('offlineQueue storage', () => {
  it('returns an empty array when nothing is queued', () => {
    expect(loadQueue()).toEqual([])
  })

  it('round-trips a saved queue', () => {
    const action: PendingAction = { type: 'delete', id: 't1', status: 'pending' }
    saveQueue([action])
    expect(loadQueue()).toEqual([action])
  })

  it('fails soft on corrupt stored JSON', () => {
    localStorage.setItem('backlog-saga:pending-actions', 'nope')
    expect(loadQueue()).toEqual([])
  })
})

describe('enqueueAction', () => {
  it('appends a new action to the end of the queue', () => {
    const queue: PendingAction[] = [{ type: 'delete', id: 't1', status: 'pending' }]
    const next = enqueueAction(queue, { type: 'complete', id: 't2', status: 'pending' })
    expect(next).toEqual([
      { type: 'delete', id: 't1', status: 'pending' },
      { type: 'complete', id: 't2', status: 'pending' }
    ])
  })

  it('collapses a create+delete pair for a todo that never synced', () => {
    const queue: PendingAction[] = [
      { type: 'create', tempId: 'temp-1', title: 'Scratch idea', category: 'cleaning', status: 'pending' },
      { type: 'patch', id: 'temp-1', title: 'Renamed', status: 'pending' }
    ]
    const next = enqueueAction(queue, { type: 'delete', id: 'temp-1', status: 'pending' })
    expect(next).toEqual([])
  })

  it('does not collapse a delete for a todo that already exists server-side', () => {
    const queue: PendingAction[] = [{ type: 'patch', id: 'server-id-1', title: 'Renamed', status: 'pending' }]
    const next = enqueueAction(queue, { type: 'delete', id: 'server-id-1', status: 'pending' })
    expect(next).toEqual([
      { type: 'patch', id: 'server-id-1', title: 'Renamed', status: 'pending' },
      { type: 'delete', id: 'server-id-1', status: 'pending' }
    ])
  })
})

describe('applyActionOptimistically', () => {
  it('adds a new todo for a create action', () => {
    const result = applyActionOptimistically([], {
      type: 'create',
      tempId: 'temp-1',
      title: 'Offline idea',
      category: 'health',
      status: 'pending'
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'temp-1',
      title: 'Offline idea',
      category: 'health',
      completedAt: null,
      guildStatus: 'init'
    })
  })

  it('updates title/category for a patch action', () => {
    const todo: Todo = {
      id: 't1',
      title: 'Old title',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: null,
      guildStatus: 'init',
      category: 'cleaning',
      text: { init: 'x' },
      chronicleWritten: false,
      version: 1
    }
    const result = applyActionOptimistically([todo], { type: 'patch', id: 't1', title: 'New title', status: 'pending' })
    expect(result[0].title).toBe('New title')
  })

  it('sets completedAt for a complete action and clears it for reopen', () => {
    const todo: Todo = {
      id: 't1',
      title: 'x',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: null,
      guildStatus: 'init',
      category: 'cleaning',
      text: { init: 'x' },
      chronicleWritten: false,
      version: 1
    }
    const completed = applyActionOptimistically([todo], { type: 'complete', id: 't1', status: 'pending' })
    expect(completed[0].completedAt).not.toBeNull()

    const reopened = applyActionOptimistically(completed, { type: 'reopen', id: 't1', status: 'pending' })
    expect(reopened[0].completedAt).toBeNull()
  })

  it('removes the todo for a delete action', () => {
    const todo: Todo = {
      id: 't1',
      title: 'x',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: null,
      guildStatus: 'init',
      category: 'cleaning',
      text: { init: 'x' },
      chronicleWritten: false,
      version: 1
    }
    expect(applyActionOptimistically([todo], { type: 'delete', id: 't1', status: 'pending' })).toEqual([])
  })
})

describe('isNetworkFailure', () => {
  it('treats an error with no response as a network failure', () => {
    expect(isNetworkFailure(new Error('fetch failed'))).toBe(true)
  })

  it('treats an error with a response as a real HTTP error, not a network failure', () => {
    const httpError = Object.assign(new Error('400'), { response: { status: 400 } })
    expect(isNetworkFailure(httpError)).toBe(false)
  })
})

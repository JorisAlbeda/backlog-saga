import { describe, it, expect } from 'vitest'
import { drainActions, reconcileQueueAfterDrain } from '../../app/utils/drainQueue'
import type { PendingAction } from '../../app/utils/offlineQueue'

function describeAction(action: PendingAction): string {
  return action.type
}

describe('drainActions', () => {
  it('resolves an action successfully and removes it from the queue', async () => {
    const actions: PendingAction[] = [{ type: 'delete', id: 't1', status: 'pending' }]
    const result = await drainActions(actions, async () => 'applied', describeAction)
    expect(result.remaining).toEqual([])
    expect(result.resolvedMessages).toEqual(['Synced: delete'])
    expect(result.stoppedEarly).toBe(false)
  })

  it('logs a discarded action distinctly when the target was already deleted', async () => {
    const actions: PendingAction[] = [{ type: 'complete', id: 't1', status: 'pending' }]
    const result = await drainActions(actions, async () => 'discarded', describeAction)
    expect(result.remaining).toEqual([])
    expect(result.resolvedMessages).toEqual(['Discarded: complete — that task was deleted'])
    expect(result.stoppedEarly).toBe(false)
  })

  it('stops the whole drain on a network failure and leaves remaining actions queued', async () => {
    const actions: PendingAction[] = [
      { type: 'delete', id: 't1', status: 'pending' },
      { type: 'complete', id: 't2', status: 'pending' }
    ]
    const networkError = new Error('fetch failed')
    const result = await drainActions(actions, async () => { throw networkError }, describeAction)
    expect(result.remaining).toEqual(actions)
    expect(result.resolvedMessages).toEqual([])
    expect(result.stoppedEarly).toBe(true)
  })

  it('marks an action failed on a non-network error and keeps draining the rest', async () => {
    const actions: PendingAction[] = [
      { type: 'complete', id: 't1', status: 'pending' },
      { type: 'delete', id: 't2', status: 'pending' }
    ]
    const httpError = Object.assign(new Error('400'), { response: { status: 400 } })
    const result = await drainActions(
      actions,
      async (action) => {
        if (action.type === 'complete') throw httpError
        return 'applied'
      },
      describeAction
    )
    expect(result.remaining).toEqual([{ type: 'complete', id: 't1', status: 'failed' }])
    expect(result.resolvedMessages).toEqual(['Synced: delete'])
    expect(result.failedMessages).toEqual(['Failed to sync: complete'])
    expect(result.stoppedEarly).toBe(false)
  })

  it('leaves already-failed actions untouched and does not retry them', async () => {
    const actions: PendingAction[] = [{ type: 'delete', id: 't1', status: 'failed' }]
    const result = await drainActions(actions, async () => { throw new Error('should not be called') }, describeAction)
    expect(result.remaining).toEqual(actions)
    expect(result.resolvedMessages).toEqual([])
  })
})

describe('reconcileQueueAfterDrain', () => {
  it('returns remaining unchanged when nothing was added during the drain', () => {
    const snapshot: PendingAction[] = [{ type: 'delete', id: 't1', status: 'pending' }]
    const remaining: PendingAction[] = []
    // current === snapshot: nothing enqueued while the drain was in flight
    const result = reconcileQueueAfterDrain(snapshot, snapshot, remaining)
    expect(result).toEqual(remaining)
  })

  it('preserves an action enqueued during the drain', () => {
    const snapshot: PendingAction[] = [{ type: 'delete', id: 't1', status: 'pending' }]
    const remaining: PendingAction[] = []
    const addedMidDrain: PendingAction = { type: 'complete', id: 't2', status: 'pending' }
    const current = [...snapshot, addedMidDrain]
    const result = reconcileQueueAfterDrain(snapshot, current, remaining)
    expect(result).toEqual([addedMidDrain])
  })

  it('does not duplicate an item that appears in both remaining and current', () => {
    const stillQueued: PendingAction = { type: 'delete', id: 't1', status: 'pending' }
    const snapshot: PendingAction[] = [stillQueued]
    const remaining: PendingAction[] = [stillQueued]
    const current: PendingAction[] = [stillQueued]
    const result = reconcileQueueAfterDrain(snapshot, current, remaining)
    expect(result).toEqual([stillQueued])
  })
})

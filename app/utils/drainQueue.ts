import type { PendingAction } from './offlineQueue'
import { isNetworkFailure } from './offlineQueue'

export interface DrainOutcome {
  remaining: PendingAction[]
  resolvedMessages: string[]
  failedMessages: string[]
  stoppedEarly: boolean
}

// Replays a queue of actions in order. A network failure (the PC dropped
// mid-drain) stops the whole pass — everything from that point on is left
// queued for the next reachable check. A real HTTP error from a still-
// reachable server only parks that one action as `failed` and keeps
// draining the rest, since it says nothing about whether the others will
// also fail. Already-`failed` actions are left untouched — they're not
// auto-retried, only a manual retry or discard changes them. The actual
// network call is injected (`replay`) so this stays testable without a
// server.
export async function drainActions(
  actions: PendingAction[],
  replay: (action: PendingAction) => Promise<void>,
  describeAction: (action: PendingAction) => string
): Promise<DrainOutcome> {
  const remaining: PendingAction[] = []
  const resolvedMessages: string[] = []
  const failedMessages: string[] = []
  let stoppedEarly = false

  for (const action of actions) {
    if (stoppedEarly || action.status === 'failed') {
      remaining.push(action)
      continue
    }
    try {
      await replay(action)
      resolvedMessages.push(`Synced: ${describeAction(action)}`)
    } catch (err) {
      if (isNetworkFailure(err)) {
        remaining.push(action)
        stoppedEarly = true
      } else {
        remaining.push({ ...action, status: 'failed' })
        failedMessages.push(`Failed to sync: ${describeAction(action)}`)
      }
    }
  }

  return { remaining, resolvedMessages, failedMessages, stoppedEarly }
}

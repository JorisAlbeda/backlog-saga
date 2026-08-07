export interface SyncStatusInput {
  pendingCount: number
  failedCount: number
  syncing: boolean
}

export function computeSyncStatusLabel(input: SyncStatusInput): string {
  if (input.syncing) return 'Syncing…'
  if (input.failedCount > 0) return `${input.failedCount} change${input.failedCount === 1 ? '' : 's'} couldn't sync`
  if (input.pendingCount > 0) return `${input.pendingCount} change${input.pendingCount === 1 ? '' : 's'} pending`
  return 'All synced'
}

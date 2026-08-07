import { describe, it, expect } from 'vitest'
import { computeSyncStatusLabel } from '../../app/utils/syncStatusLabel'

describe('computeSyncStatusLabel', () => {
  it('shows "Syncing…" while a sync is in progress, regardless of counts', () => {
    expect(computeSyncStatusLabel({ pendingCount: 3, failedCount: 1, syncing: true })).toBe('Syncing…')
  })

  it('prioritizes failed count over pending count', () => {
    expect(computeSyncStatusLabel({ pendingCount: 2, failedCount: 1, syncing: false })).toBe("1 change couldn't sync")
  })

  it('pluralizes failed count', () => {
    expect(computeSyncStatusLabel({ pendingCount: 0, failedCount: 2, syncing: false })).toBe("2 changes couldn't sync")
  })

  it('shows pending count when nothing has failed', () => {
    expect(computeSyncStatusLabel({ pendingCount: 1, failedCount: 0, syncing: false })).toBe('1 change pending')
  })

  it('pluralizes pending count', () => {
    expect(computeSyncStatusLabel({ pendingCount: 3, failedCount: 0, syncing: false })).toBe('3 changes pending')
  })

  it('shows "All synced" when idle with nothing pending or failed', () => {
    expect(computeSyncStatusLabel({ pendingCount: 0, failedCount: 0, syncing: false })).toBe('All synced')
  })
})

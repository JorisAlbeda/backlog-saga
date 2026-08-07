import { describe, it, expect } from 'vitest'
import { shouldAttemptBackgroundSync } from '../../app/utils/backgroundSync'

describe('shouldAttemptBackgroundSync', () => {
  it('skips when the connection type is cellular', () => {
    expect(shouldAttemptBackgroundSync({ type: 'cellular' })).toBe(false)
  })

  it('attempts on wifi', () => {
    expect(shouldAttemptBackgroundSync({ type: 'wifi' })).toBe(true)
  })

  it('attempts when connection info is unavailable', () => {
    expect(shouldAttemptBackgroundSync(undefined)).toBe(true)
  })
})

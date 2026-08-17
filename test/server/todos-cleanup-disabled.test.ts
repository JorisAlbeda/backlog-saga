import { describe, it, expect } from 'vitest'
import { deleteOldDoneTodos } from '../../server/utils/store'

// Not an e2e test: see the comment in todos-cleanup.e2e.test.ts for why the
// "TODO_RETENTION_DAYS=0 disables cleanup" scenario isn't exercised through
// a real dev-server HTTP round trip. deleteOldDoneTodos's retentionDays <= 0
// guard returns before ever calling useStorage(), so it's callable directly
// here with no Nitro server running at all — a genuine call against the
// real function, just below the HTTP/task layer rather than through it.
describe('deleteOldDoneTodos', () => {
  it('returns 0 without touching storage when retentionDays is 0', async () => {
    await expect(deleteOldDoneTodos(0)).resolves.toBe(0)
  })

  it('returns 0 without touching storage when retentionDays is negative', async () => {
    await expect(deleteOldDoneTodos(-1)).resolves.toBe(0)
  })
})

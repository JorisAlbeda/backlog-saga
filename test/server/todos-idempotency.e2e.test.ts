import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))

await setup({
  env: { DATA_DIR: dataDir }
})

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('idempotent mutation endpoints', () => {
  it('PATCH on a missing id returns 200 with a not-found marker, not a 404', async () => {
    const result = await $fetch('/api/todos/does-not-exist', {
      method: 'PATCH',
      body: { title: 'new title' }
    })
    expect(result).toEqual({ id: 'does-not-exist', status: 'not-found' })
  })

  it('PATCH complete on a missing id also returns the not-found marker', async () => {
    const result = await $fetch('/api/todos/also-missing', {
      method: 'PATCH',
      body: { action: 'complete' }
    })
    expect(result).toEqual({ id: 'also-missing', status: 'not-found' })
  })
})

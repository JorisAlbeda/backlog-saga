import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))
process.env.DATA_DIR = dataDir

await setup()

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('smoke test', () => {
  it('GET /api/todos returns an empty list against isolated storage', async () => {
    const todos = await $fetch('/api/todos')
    expect(todos).toEqual([])
  })
})

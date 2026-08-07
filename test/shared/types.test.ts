import { describe, it, expect } from 'vitest'
import { isTodoNotFound } from '../../shared/types'
import type { Todo } from '../../shared/types'

const sampleTodo: Todo = {
  id: 't1',
  title: 'Fix the fence post',
  createdAt: '2026-08-01T00:00:00.000Z',
  completedAt: null,
  guildStatus: 'init',
  category: 'home-improvement',
  text: { init: 'A construction guild task awaits.' },
  chronicleWritten: false,
  version: 1
}

describe('isTodoNotFound', () => {
  it('is true for a not-found marker', () => {
    expect(isTodoNotFound({ id: 't1', status: 'not-found' })).toBe(true)
  })

  it('is false for a real Todo', () => {
    expect(isTodoNotFound(sampleTodo)).toBe(false)
  })
})

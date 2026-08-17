import { describe, it, expect } from 'vitest'
import { isTodoNotFound, isEligibleForCleanup } from '../../shared/types'
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

describe('isEligibleForCleanup', () => {
  const DAY_MS = 24 * 60 * 60 * 1000
  const now = Date.parse('2026-08-17T00:00:00.000Z')

  function baseTodo(overrides: Partial<{ completedAt: string | null; guildStatus: 'init' | 'drafted' | 'chronicled'; chronicleWritten: boolean }>) {
    return {
      completedAt: null,
      guildStatus: 'init' as const,
      chronicleWritten: false,
      ...overrides
    }
  }

  it('is eligible when Done and older than the retention window', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 10 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(true)
  })

  it('is not eligible when Done but within the retention window', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 2 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible at exactly the retention boundary (strict greater-than)', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 7 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible for a To Do (never completed), no matter how old', () => {
    const todo = baseTodo({ completedAt: null, guildStatus: 'init' })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible for a Taking Shape todo, no matter how old', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 30 * DAY_MS).toISOString(),
      guildStatus: 'drafted',
      chronicleWritten: false
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is not eligible when guildStatus is chronicled but chronicleWritten is false (defensive guard)', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 10 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: false
    })
    expect(isEligibleForCleanup(todo, 7, now)).toBe(false)
  })

  it('is never eligible when retentionDays is 0 (disabled), regardless of age', () => {
    const todo = baseTodo({
      completedAt: new Date(now - 365 * DAY_MS).toISOString(),
      guildStatus: 'chronicled',
      chronicleWritten: true
    })
    expect(isEligibleForCleanup(todo, 0, now)).toBe(false)
  })
})

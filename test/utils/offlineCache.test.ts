// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadCachedTodos, saveCachedTodos } from '../../app/utils/offlineCache'
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

beforeEach(() => {
  localStorage.clear()
})

describe('offlineCache', () => {
  it('returns an empty array when nothing is cached', () => {
    expect(loadCachedTodos()).toEqual([])
  })

  it('round-trips a saved todo list', () => {
    saveCachedTodos([sampleTodo])
    expect(loadCachedTodos()).toEqual([sampleTodo])
  })

  it('fails soft on corrupt stored JSON instead of throwing', () => {
    localStorage.setItem('backlog-saga:todos-cache', '{not valid json')
    expect(loadCachedTodos()).toEqual([])
  })

  it('does not throw when localStorage is unavailable (getItem error recovery)', () => {
    // Create a scenario where getItem is mocked to throw
    const warnSpy = vi.spyOn(console, 'warn')
    const originalGetItem = localStorage.getItem

    try {
      localStorage.getItem = () => {
        throw new Error('Storage access denied')
      }
      // The key test: even with getItem throwing, the function must not throw
      expect(() => loadCachedTodos()).not.toThrow()
      expect(loadCachedTodos()).toEqual([])
    } finally {
      localStorage.getItem = originalGetItem
      warnSpy.mockRestore()
    }
  })

  it('does not throw when localStorage.setItem fails (quota or disabled)', () => {
    // Create a scenario where setItem is mocked to throw
    const warnSpy = vi.spyOn(console, 'warn')
    const originalSetItem = localStorage.setItem

    try {
      localStorage.setItem = () => {
        throw new Error('QuotaExceededError')
      }
      // The key test: even with setItem throwing, the function must not throw
      expect(() => saveCachedTodos([sampleTodo])).not.toThrow()
    } finally {
      localStorage.setItem = originalSetItem
      warnSpy.mockRestore()
    }
  })

  it('logs a warning when cache is reset due to corrupt JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('backlog-saga:todos-cache', '{not valid json')

    loadCachedTodos()

    expect(warnSpy).toHaveBeenCalledWith(
      '[offlineCache] failed to load cached todos, resetting to empty',
      expect.any(SyntaxError)
    )
    warnSpy.mockRestore()
  })
})

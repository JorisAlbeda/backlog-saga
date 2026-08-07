// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
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
})

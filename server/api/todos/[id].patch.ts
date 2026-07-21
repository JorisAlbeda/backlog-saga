import type { Category, Todo } from '../../../shared/types'

interface PatchBody {
  title?: string
  category?: Category
  action?: 'complete' | 'reopen'
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const body = await readBody<PatchBody>(event)

  let title: string | undefined
  if (typeof body?.title === 'string') {
    title = body.title.trim()
    if (!title) {
      throw createError({ statusCode: 400, statusMessage: 'title cannot be empty' })
    }
  }

  const category = body?.category
  if (category !== undefined) {
    assertValidCategory(category)
  }

  // Computed from the live stored todo, inside the same lock that performs
  // the write — so this always sees fresh state, never a stale outer read.
  const updated = await updateTodo(id, existing => {
    const patch: Partial<Todo> = {}

    if (title !== undefined) {
      patch.title = title
    }

    if (category !== undefined) {
      patch.category = category
      if (category !== existing.category) {
        // Previous faction's progress no longer applies under the new
        // category — reset guild state (but not completedAt) so it
        // re-drafts/re-chronicles fresh.
        Object.assign(patch, initialGuildState(category))
      }
    }

    if (body?.action === 'complete') {
      patch.completedAt = new Date().toISOString()
    } else if (body?.action === 'reopen') {
      // Reopening clears completion and any chronicle link so re-completing
      // builds again; existing world-material.md / Chronicle entries are
      // never edited or removed, matching the append-only chronicle design.
      // Uses the new category if this same request also changed it.
      patch.completedAt = null
      Object.assign(patch, initialGuildState(patch.category ?? existing.category))
    }

    return patch
  })

  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'todo not found' })
  }
  return updated
})

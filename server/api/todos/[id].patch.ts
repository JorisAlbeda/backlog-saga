import type { Todo } from '../../../shared/types'

interface PatchBody {
  title?: string
  action?: 'complete' | 'reopen'
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }

  const body = await readBody<PatchBody>(event)
  const patch: Partial<Todo> = {}

  if (typeof body?.title === 'string') {
    const title = body.title.trim()
    if (!title) {
      throw createError({ statusCode: 400, statusMessage: 'title cannot be empty' })
    }
    patch.title = title
  }

  if (body?.action === 'complete') {
    patch.completedAt = new Date().toISOString()
  } else if (body?.action === 'reopen') {
    // Reopening clears completion and any chronicle link so re-completing
    // builds again; existing world-material.md / Chronicle entries are
    // never edited or removed, matching the append-only chronicle design.
    patch.completedAt = null
    patch.guildStatus = 'init'
    patch.category = undefined
    patch.text = { init: 'The Construction Guild is building.' }
    patch.buildingName = undefined
    patch.material = undefined
    patch.chronicleWritten = false
  }

  const updated = await updateTodo(id, patch)
  if (!updated) {
    throw createError({ statusCode: 404, statusMessage: 'todo not found' })
  }
  return updated
})

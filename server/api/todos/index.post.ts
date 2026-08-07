import type { Category } from '../../../shared/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string; title?: string; category?: Category }>(event)
  const title = body?.title?.trim()
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }
  const category = body?.category
  assertValidCategory(category)

  let id: string | undefined
  if (body?.id !== undefined) {
    if (typeof body.id !== 'string' || !body.id.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'id must be a non-empty string if provided' })
    }
    id = body.id
  }

  return createTodo(title, category, id)
})

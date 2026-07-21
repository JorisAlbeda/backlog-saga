import type { Category } from '../../../shared/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: string; category?: Category }>(event)
  const title = body?.title?.trim()
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }
  const category = body?.category
  assertValidCategory(category)
  return createTodo(title, category)
})

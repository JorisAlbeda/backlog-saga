export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }
  const deleted = await deleteTodo(id)
  if (!deleted) {
    throw createError({ statusCode: 404, statusMessage: 'todo not found' })
  }
  return { ok: true }
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }
  const todo = await getTodo(id)
  if (!todo) {
    throw createError({ statusCode: 404, statusMessage: 'todo not found' })
  }
  return todo
})

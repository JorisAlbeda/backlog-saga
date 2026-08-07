export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }
  // Idempotent: the desired end state ("this todo doesn't exist") is
  // already true whether or not it existed a moment ago, so there's
  // nothing to distinguish in the response either way.
  await deleteTodo(id)
  return { ok: true }
})

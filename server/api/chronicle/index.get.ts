export default defineEventHandler(async () => {
  const entries = await listChronicle()
  return [...entries].sort((a, b) => b.number - a.number)
})

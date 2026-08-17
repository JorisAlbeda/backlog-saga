import { deleteOldDoneTodos } from '../../utils/store'

export default defineTask({
  meta: {
    name: 'todos:cleanup',
    description: 'Remove Done todos older than the configured retention window'
  },
  async run() {
    const retentionDays = useRuntimeConfig().todoRetentionDays as number
    if (retentionDays <= 0) {
      console.log(`[todos:cleanup] disabled (TODO_RETENTION_DAYS=${retentionDays})`)
      return { removed: 0 }
    }
    const removed = await deleteOldDoneTodos(retentionDays)
    console.log(`[todos:cleanup] removed ${removed} todos older than ${retentionDays}d`)
    return { removed }
  }
})

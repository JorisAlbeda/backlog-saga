import { runGuildResolution } from '../../utils/guild'

export default defineTask({
  meta: {
    name: 'guild:resolve',
    description: 'Advance Construction Guild message generation for pending and completed todos'
  },
  async run() {
    const result = await runGuildResolution()
    if (!result.reachable) {
      console.log('[guild:resolve] Ollama unreachable, skipped')
    } else {
      console.log(`[guild:resolve] categorised=${result.categorised} chronicled=${result.chronicled}`)
    }
    return { result }
  }
})

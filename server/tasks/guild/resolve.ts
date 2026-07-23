import { runGuildResolution } from '../../utils/guild'

export default defineTask({
  meta: {
    name: 'guild:resolve',
    description: 'Advance faction message generation for pending and completed todos'
  },
  async run() {
    const result = await runGuildResolution()
    const codexNote = !result.codex.configured
      ? 'codex=disabled'
      : `codex=${result.codex.entityCount}${result.codex.lastError ? ` (last error: ${result.codex.lastError})` : ''}`
    if (!result.reachable) {
      console.log(`[guild:resolve] Ollama unreachable, skipped (${codexNote})`)
    } else {
      console.log(`[guild:resolve] drafted=${result.drafted} chronicled=${result.chronicled} ${codexNote}`)
    }
    return { result }
  }
})

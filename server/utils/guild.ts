import { appendChronicleEntry, listTodos, updateTodo } from './store'
import { generateSubtype, generateChronicle, generateCodexEntry, isOllamaReachable } from './ollama'
import { appendWorldMaterial } from './worldMaterial'
import { getFaction } from '../../shared/factions'
import { getCodexStatus, type CodexStatus } from './codex'
import { writeCodexEntry, codexCategoryFor } from './codexWriteBack'

export interface GuildRunResult {
  reachable: boolean
  drafted: number
  chronicled: number
  codex: CodexStatus
}

// Advances guildStatus for pending/completed todos when Ollama is reachable.
// Never blocks or throws on a per-todo failure — one bad generation must not
// stall the whole run or any other todo's progress.
export async function runGuildResolution(): Promise<GuildRunResult> {
  const reachable = await isOllamaReachable()
  const codex = await getCodexStatus()
  if (!reachable) {
    return { reachable: false, drafted: 0, chronicled: 0, codex }
  }

  let drafted = 0
  let chronicled = 0

  const todos = await listTodos()
  for (const todo of todos) {
    if (todo.guildStatus !== 'init') continue
    try {
      const { subtype } = await generateSubtype(todo.title, todo.category)
      const faction = getFaction(todo.category)
      const updated = await updateTodo(
        todo.id,
        {
          guildStatus: 'drafted',
          subtype,
          text: { ...todo.text, drafted: faction.draftedTemplate(subtype) }
        },
        todo.version
      )
      if (!updated) {
        console.warn(`[guild] skipped drafting todo ${todo.id}: changed concurrently`)
        continue
      }
      drafted++
    } catch (err) {
      console.error(`[guild] subtype generation failed for todo ${todo.id}`, err)
    }
  }

  const afterDraft = await listTodos()
  for (const todo of afterDraft) {
    if (!todo.completedAt || todo.chronicleWritten || !todo.subtype) continue
    try {
      const { resultName, resultDetail, dispatch } = await generateChronicle(todo.title, todo.category, todo.subtype)
      // Write the permanent Chronicle/world-material records first; only once
      // they've succeeded do we flip guildStatus/chronicleWritten, and both
      // flip together in a single write so the two can never disagree.
      const entry = await appendChronicleEntry({
        todoId: todo.id,
        category: todo.category,
        subtype: todo.subtype,
        resultName,
        resultDetail,
        sourceTask: todo.title,
        dispatch,
        builtAt: new Date().toISOString()
      })
      await appendWorldMaterial(entry)
      const updated = await updateTodo(
        todo.id,
        {
          guildStatus: 'chronicled',
          text: { ...todo.text, chronicled: dispatch },
          resultName,
          resultDetail,
          chronicleWritten: true
        },
        todo.version
      )
      if (!updated) {
        console.warn(`[guild] chronicled todo ${todo.id} but it changed concurrently; state not applied`)
        continue
      }
      chronicled++

      // Best-effort write-back into the codex, isolated in its own
      // try/catch: the chronicle above is already the durable record of
      // what happened, so a failure here must never undo or misreport it.
      try {
        const codexCategory = codexCategoryFor(todo.category)
        const sourceText = `${todo.title}\n${resultDetail}\n${dispatch}`
        const { description, history, location } = await generateCodexEntry(resultName, codexCategory, sourceText)
        await writeCodexEntry({ category: todo.category, resultName, description, history, location })
      } catch (err) {
        console.warn(`[guild] codex write-back failed for todo ${todo.id}, chronicle was still recorded`, err)
      }
    } catch (err) {
      console.error(`[guild] chronicle generation failed for todo ${todo.id}`, err)
    }
  }

  return { reachable: true, drafted, chronicled, codex }
}

import { appendChronicleEntry, listTodos, updateTodo } from './store'
import { generateCategory, generateChronicle, isOllamaReachable } from './ollama'
import { appendWorldMaterial } from './worldMaterial'

export interface GuildRunResult {
  reachable: boolean
  categorised: number
  chronicled: number
}

// Advances guildStatus for pending/completed todos when Ollama is reachable.
// Never blocks or throws on a per-todo failure — one bad generation must not
// stall the whole run or any other todo's progress.
export async function runGuildResolution(): Promise<GuildRunResult> {
  const reachable = await isOllamaReachable()
  if (!reachable) {
    return { reachable: false, categorised: 0, chronicled: 0 }
  }

  let categorised = 0
  let chronicled = 0

  const todos = await listTodos()
  for (const todo of todos) {
    if (todo.guildStatus !== 'init') continue
    try {
      const { category } = await generateCategory(todo.title)
      await updateTodo(todo.id, {
        guildStatus: 'categorised',
        category,
        text: { ...todo.text, categorised: `By Imperial order, the Construction Guild is building a ${category}.` }
      })
      categorised++
    } catch (err) {
      console.error(`[guild] category generation failed for todo ${todo.id}`, err)
    }
  }

  const afterCategory = await listTodos()
  for (const todo of afterCategory) {
    if (!todo.completedAt || todo.guildStatus === 'chronicled' || !todo.category) continue
    try {
      const { buildingName, material, dispatch } = await generateChronicle(todo.title, todo.category)
      await updateTodo(todo.id, {
        guildStatus: 'chronicled',
        text: { ...todo.text, chronicled: dispatch },
        buildingName,
        material
      })
      if (!todo.chronicleWritten) {
        const entry = await appendChronicleEntry({
          todoId: todo.id,
          buildingName,
          material,
          sourceTask: todo.title,
          dispatch,
          builtAt: new Date().toISOString()
        })
        await appendWorldMaterial(entry)
        await updateTodo(todo.id, { chronicleWritten: true })
      }
      chronicled++
    } catch (err) {
      console.error(`[guild] chronicle generation failed for todo ${todo.id}`, err)
    }
  }

  return { reachable: true, categorised, chronicled }
}

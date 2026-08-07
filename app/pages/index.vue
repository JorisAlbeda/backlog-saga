<script setup lang="ts">
import type { Category, Todo } from "~~/shared/types"
import { CATEGORIES, getFaction } from "~~/shared/factions"

useHead({ title: "Ledger" })

const {
  todos,
  lastSyncedAt,
  refresh,
  createTodo,
  editTodo,
  completeTodo,
  removeTodo,
  startPolling,
  stopPolling,
} = useTodos()

onMounted(async () => {
  try {
    await refresh()
  } catch (err) {
    console.error("[ledger] initial load failed", err)
  }
  startPolling()
})
onUnmounted(() => {
  stopPolling()
})

// Grouped by category/faction, in the fixed order factions are declared
// (not task recency), so sections don't reshuffle as tasks are added or
// completed. Tasks within a group are sorted newest first. A todo whose
// category isn't one of the known CATEGORIES (shouldn't happen via normal
// create/edit — assertValidCategory blocks it server-side — but legacy or
// hand-edited data isn't guaranteed to match) still gets its own section
// via getFaction's fallback, rather than silently disappearing: dropping
// it here would also desync the empty-state check below, which looks at
// the raw todo count, not this grouping.
const groupedTodos = computed(() => {
  const byCategory = new Map<string, Todo[]>()
  for (const todo of todos.value) {
    const group = byCategory.get(todo.category)
    if (group) group.push(todo)
    else byCategory.set(todo.category, [todo])
  }
  const orderedKeys = [
    ...CATEGORIES,
    ...[...byCategory.keys()].filter((key) => !(CATEGORIES as string[]).includes(key)),
  ]
  return orderedKeys
    .map((category) => ({
      category,
      todos: (byCategory.get(category) ?? []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }))
    .filter((group) => group.todos.length > 0)
})

const showAddOverlay = ref(false)
const editingTodo = ref<Todo | null>(null)
const completingTodo = ref<Todo | null>(null)
// Held by id (not the Todo object itself) and re-derived from the live
// `todos` list below, so the popup reflects edits/deletions instead of
// freezing on whatever snapshot was open when it was first tapped.
const inspectingTodoId = ref<string | null>(null)
const inspectingTodo = computed(() =>
  inspectingTodoId.value ? (todos.value.find((t) => t.id === inspectingTodoId.value) ?? null) : null,
)

async function handleAddSubmit({
  title,
  category,
}: {
  title: string
  category: Category
}) {
  if (editingTodo.value) {
    await editTodo(editingTodo.value.id, title, category)
    editingTodo.value = null
  } else {
    await createTodo(title, category)
    showAddOverlay.value = false
  }
}

// A row's interactive targets (checkbox/body/edit icon) all stay live
// while `handleComplete`'s PATCH is in flight, since the todo's state
// doesn't flip until it resolves — so a fast tap on a second target can
// set another one of these refs before that happens. Each setter below
// clears the other two, so whichever one is set most recently is the only
// overlay left open, instead of two rendering stacked at once.
function openEdit(todo: Todo) {
  completingTodo.value = null
  inspectingTodoId.value = null
  editingTodo.value = todo
}

async function handleRemove(todo: Todo) {
  await removeTodo(todo.id)
}

async function handleComplete(todo: Todo) {
  const updated = await completeTodo(todo.id)
  editingTodo.value = null
  inspectingTodoId.value = null
  completingTodo.value = updated
}

function goToDispatch(todo: Todo) {
  navigateTo(`/dispatch/${todo.id}`)
}

function inspectTodo(todo: Todo) {
  editingTodo.value = null
  completingTodo.value = null
  inspectingTodoId.value = todo.id
}
</script>

<template>
  <div class="ledger-page">
    <LedgerHeader />

    <EmptyState v-if="todos.length === 0" variant="ledger">
      <PrimaryButton variant="navy" @click="showAddOverlay = true"
        >Draft First Task</PrimaryButton
      >
    </EmptyState>

    <div v-else class="task-groups">
      <section v-for="group in groupedTodos" :key="group.category" class="task-group">
        <h2 class="task-group__header">
          <span class="task-group__category">{{ getFaction(group.category).selectLabel }}</span>
          <span class="task-group__faction">{{ getFaction(group.category).factionName }}</span>
        </h2>
        <ul class="task-list">
          <li v-for="todo in group.todos" :key="todo.id">
            <TaskRow
              :todo="todo"
              :last-synced-at="lastSyncedAt"
              @complete="handleComplete"
              @inspect="inspectTodo"
              @open="goToDispatch"
              @edit="openEdit"
              @remove="handleRemove"
            />
          </li>
        </ul>
      </section>
    </div>

    <Fab @click="showAddOverlay = true" />

    <AddTaskOverlay
      v-if="showAddOverlay"
      mode="create"
      @submit="handleAddSubmit"
      @dismiss="showAddOverlay = false"
    />

    <AddTaskOverlay
      v-if="editingTodo"
      mode="edit"
      :initial-title="editingTodo.title"
      :initial-category="editingTodo.category"
      @submit="handleAddSubmit"
      @dismiss="editingTodo = null"
    />

    <CompletionOverlay
      v-if="completingTodo"
      :todo="completingTodo"
      @dismiss="completingTodo = null"
    />

    <TaskDetailOverlay
      v-if="inspectingTodo"
      :todo="inspectingTodo"
      @dismiss="inspectingTodoId = null"
    />
  </div>
</template>

<style scoped>
.ledger-page {
  padding-bottom: 110px;
}

.task-groups {
  padding: 20px var(--spacing-screen-inset) 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
  max-height: calc(100vh - 69px - 110px);
  overflow-y: auto;
}

.task-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-group__header {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.task-group__category {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.task-group__faction {
  font-size: 13px;
  font-weight: 400;
  color: var(--color-caption);
}

.task-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--row-gap);
}
</style>

<script setup lang="ts">
import type { Category, Todo } from "~~/shared/types"
import { CATEGORIES, getFaction } from "~~/shared/factions"

useHead({ title: "Ledger" })

const {
  todos,
  lastSyncedAt,
  refresh,
  createTodo,
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
// completed. Empty categories are omitted. Tasks within a group keep the
// original creation-order sort.
const groupedTodos = computed(() => {
  const byCategory = new Map<Category, Todo[]>()
  for (const todo of todos.value) {
    const group = byCategory.get(todo.category)
    if (group) group.push(todo)
    else byCategory.set(todo.category, [todo])
  }
  return CATEGORIES.map((category) => ({
    category,
    todos: (byCategory.get(category) ?? []).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
  })).filter((group) => group.todos.length > 0)
})

const showAddOverlay = ref(false)
const editingTodo = ref<Todo | null>(null)
const completingTodo = ref<Todo | null>(null)

async function handleAddSubmit({
  title,
  category,
}: {
  title: string
  category: Category
}) {
  if (editingTodo.value) {
    try {
      await $fetch(`/api/todos/${editingTodo.value.id}`, {
        method: "PATCH",
        body: { title, category },
      })
    } catch (err) {
      console.error("[ledger] failed to save task", err)
    }
    await refresh()
    editingTodo.value = null
  } else {
    await createTodo(title, category)
    showAddOverlay.value = false
  }
}

function openEdit(todo: Todo) {
  editingTodo.value = todo
}

async function handleRemove(todo: Todo) {
  await removeTodo(todo.id)
}

async function handleComplete(todo: Todo) {
  const updated = await completeTodo(todo.id)
  completingTodo.value = updated
}

function goToDispatch(todo: Todo) {
  navigateTo(`/dispatch/${todo.id}`)
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

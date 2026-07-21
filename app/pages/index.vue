<script setup lang="ts">
import type { Category, Todo } from '~~/shared/types'

const { todos, lastSyncedAt, refresh, createTodo, completeTodo, removeTodo, startPolling, stopPolling } = useTodos()

onMounted(async () => {
  try {
    await refresh()
  } catch (err) {
    console.error('[ledger] initial load failed', err)
  }
  startPolling()
})
onUnmounted(() => {
  stopPolling()
})

const sortedTodos = computed(() =>
  [...todos.value].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
)

const showAddOverlay = ref(false)
const editingTodo = ref<Todo | null>(null)
const completingTodo = ref<Todo | null>(null)

async function handleAddSubmit({ title, category }: { title: string; category: Category }) {
  if (editingTodo.value) {
    try {
      await $fetch(`/api/todos/${editingTodo.value.id}`, { method: 'PATCH', body: { title, category } })
    } catch (err) {
      console.error('[ledger] failed to save task', err)
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

    <EmptyState v-if="sortedTodos.length === 0" variant="ledger">
      <PrimaryButton variant="navy" @click="showAddOverlay = true">Draft First Task</PrimaryButton>
    </EmptyState>

    <ul v-else class="task-list">
      <li v-for="todo in sortedTodos" :key="todo.id">
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

.task-list {
  list-style: none;
  margin: 0;
  padding: 20px var(--spacing-screen-inset) 0;
  display: flex;
  flex-direction: column;
  gap: var(--row-gap);
  max-height: calc(100vh - 69px - 110px);
  overflow-y: auto;
}
</style>

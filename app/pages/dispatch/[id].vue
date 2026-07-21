<script setup lang="ts">
import type { Todo } from '~~/shared/types'

const route = useRoute()
const id = route.params.id as string

const { data: todo, error } = await useFetch<Todo>(`/api/todos/${id}`)
</script>

<template>
  <div class="dispatch-page">
    <header class="dispatch-page__header">
      <p class="caption">Guild Dispatch</p>
    </header>

    <div v-if="error" class="dispatch-page__missing">
      <p>This dispatch could not be found.</p>
      <PrimaryButton variant="navy" @click="navigateTo('/')">Return to Ledger</PrimaryButton>
    </div>

    <div v-else-if="todo" class="dispatch-page__content">
      <DispatchCard
        :building-name="todo.buildingName ?? 'Building'"
        :material="todo.material"
        :dispatch="todo.text.chronicled ?? todo.text.categorised ?? todo.text.init"
        :source-task="todo.title"
      />

      <PrimaryButton variant="navy" @click="navigateTo('/')">Return to Ledger</PrimaryButton>
    </div>
  </div>
</template>

<style scoped>
.dispatch-page {
  padding: 0 var(--spacing-screen-inset) 40px;
}

.dispatch-page__header {
  padding: 20px 0 4px;
}

.dispatch-page__content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-top: 4px;
}

.dispatch-page__missing {
  text-align: center;
  padding: 60px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}
</style>

<script setup lang="ts">
import { currentGuildText, getTaskState, type Todo } from '~~/shared/types'
import { getFaction } from '~~/shared/factions'

const route = useRoute()
const id = route.params.id as string

const { data: todo, error } = await useFetch<Todo>(`/api/todos/${id}`)
const state = computed(() => (todo.value ? getTaskState(todo.value) : undefined))
const faction = computed(() => (todo.value ? getFaction(todo.value.category) : undefined))
</script>

<template>
  <div class="dispatch-page">
    <header class="dispatch-page__header">
      <p class="caption">{{ faction?.dispatchLabel ?? 'Dispatch' }}</p>
    </header>

    <div v-if="error" class="dispatch-page__missing">
      <p>This dispatch could not be found.</p>
      <PrimaryButton variant="navy" @click="navigateTo('/')">Return to Ledger</PrimaryButton>
    </div>

    <div v-else-if="state !== 'done'" class="dispatch-page__missing">
      <p>The {{ faction?.factionName ?? 'guild' }} hasn't finished this one yet.</p>
      <PrimaryButton variant="navy" @click="navigateTo('/')">Return to Ledger</PrimaryButton>
    </div>

    <div v-else-if="todo && faction" class="dispatch-page__content">
      <DispatchCard
        :result-name="todo.resultName ?? faction.noun"
        :result-detail="todo.resultDetail"
        :dispatch="currentGuildText(todo)"
        :source-task="todo.title"
        :dispatch-label="faction.dispatchLabel"
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

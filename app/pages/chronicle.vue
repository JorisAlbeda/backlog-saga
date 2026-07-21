<script setup lang="ts">
import type { ChronicleEntry } from '~~/shared/types'

const { data: entries, refresh } = await useFetch<ChronicleEntry[]>('/api/chronicle')

onMounted(() => {
  refresh()
})
</script>

<template>
  <div class="chronicle-page">
    <LedgerHeader
      title="THE CHRONICLE"
      volume-label="ACCUMULATED DISPATCHES"
      subtitle="Every building the Guild has raised so far"
      link-to="/"
      link-label="Ledger"
    />

    <EmptyState v-if="!entries || entries.length === 0" variant="chronicle">
      <PrimaryButton variant="navy" @click="navigateTo('/')">Return to Ledger</PrimaryButton>
    </EmptyState>

    <ul v-else class="chronicle-scroll">
      <li v-for="entry in entries" :key="entry.number">
        <DispatchCard
          compact
          :building-name="entry.buildingName"
          :material="entry.material"
          :dispatch="entry.dispatch"
          :source-task="entry.sourceTask"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.chronicle-page {
  padding-bottom: 32px;
}

.chronicle-scroll {
  list-style: none;
  margin: 0;
  padding: 20px var(--spacing-screen-inset) 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: calc(100vh - 69px);
  overflow-y: auto;
}
</style>

<script setup lang="ts">
import { computeSyncStatusLabel } from '../utils/syncStatusLabel'

const props = defineProps<{
  pendingCount: number
  failedCount: number
  syncing: boolean
}>()

const emit = defineEmits<{ sync: [] }>()

const label = computed(() => computeSyncStatusLabel(props))

const isIdle = computed(() => !props.syncing && props.pendingCount === 0 && props.failedCount === 0)
</script>

<template>
  <button
    type="button"
    class="sync-status"
    :class="{ 'sync-status--attention': failedCount > 0 }"
    :aria-label="`${label}. Tap to sync now.`"
    :disabled="isIdle && !syncing"
    @click="emit('sync')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.sync-status {
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 11px;
  color: var(--color-caption);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.sync-status:disabled {
  cursor: default;
}

.sync-status:not(:disabled):hover {
  background: var(--color-bg-base);
}

.sync-status--attention {
  color: var(--color-accent-text);
}
</style>

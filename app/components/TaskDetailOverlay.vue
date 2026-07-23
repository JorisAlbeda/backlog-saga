<script setup lang="ts">
import type { Todo } from '~~/shared/types'
import { getFaction } from '~~/shared/factions'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{ dismiss: [] }>()

const faction = computed(() => getFaction(props.todo.category))
</script>

<template>
  <div class="overlay-scrim" role="presentation" @click.self="emit('dismiss')">
    <div class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <p class="caption overlay-card__eyebrow">{{ faction.selectLabel }} — {{ faction.factionName }}</p>
      <h2 id="task-detail-title">{{ todo.title }}</h2>

      <PrimaryButton variant="navy" @click="emit('dismiss')">Close</PrimaryButton>
    </div>
  </div>
</template>

<style scoped>
.overlay-scrim {
  position: absolute;
  inset: 0;
  background: rgba(26, 20, 14, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-screen-inset);
  z-index: 20;
}

.overlay-card {
  width: 100%;
  background: var(--color-bg-card);
  border-radius: var(--radius-card);
  padding: var(--spacing-internal-card);
  text-align: left;
}

.overlay-card__eyebrow {
  margin: 0 0 8px;
}

.overlay-card h2 {
  margin: 0 0 20px;
  font-family: var(--font-heading);
  font-size: 19px;
  line-height: 1.4;
  color: var(--color-text-primary);
  overflow-wrap: break-word;
}
</style>

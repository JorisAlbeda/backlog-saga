<script setup lang="ts">
import { currentGuildText, type Todo } from '~~/shared/types'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{ dismiss: [] }>()

const statusText = computed(() => currentGuildText(props.todo))
</script>

<template>
  <div class="overlay-scrim" role="presentation" @click.self="emit('dismiss')">
    <div class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="completion-title">
      <p class="caption overlay-card__eyebrow">Task Completed</p>
      <h2 id="completion-title">{{ todo.title }}</h2>

      <p class="overlay-card__status">{{ statusText }}</p>

      <PrimaryButton variant="amber" @click="emit('dismiss')">See What Unfolds</PrimaryButton>
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
  text-align: center;
}

.overlay-card__eyebrow {
  margin: 0 0 8px;
}

.overlay-card h2 {
  margin: 0 0 16px;
  font-family: var(--font-heading);
  font-size: 20px;
  color: var(--color-text-primary);
}

.overlay-card__status {
  margin: 0 0 24px;
  font-family: var(--font-body-italic);
  font-style: italic;
  font-size: 15px;
  line-height: 1.5;
  color: var(--color-accent-text);
}
</style>

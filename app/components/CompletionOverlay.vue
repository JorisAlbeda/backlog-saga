<script setup lang="ts">
import { currentGuildText, type Todo } from '~~/shared/types'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{ dismiss: [] }>()

const statusText = computed(() => currentGuildText(props.todo))
</script>

<template>
  <BaseOverlay center aria-labelledby="completion-title" @dismiss="emit('dismiss')">
    <p class="caption overlay-card__eyebrow">Task Completed</p>
    <h2 id="completion-title">{{ todo.title }}</h2>

    <p class="overlay-card__status">{{ statusText }}</p>

    <PrimaryButton variant="amber" @click="emit('dismiss')">See What Unfolds</PrimaryButton>
  </BaseOverlay>
</template>

<style scoped>
.overlay-card__eyebrow {
  margin: 0 0 8px;
}

h2 {
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

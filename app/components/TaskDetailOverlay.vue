<script setup lang="ts">
import type { Todo } from '~~/shared/types'
import { getFaction } from '~~/shared/factions'

const props = defineProps<{ todo: Todo }>()
const emit = defineEmits<{ dismiss: [] }>()

const faction = computed(() => getFaction(props.todo.category))
</script>

<template>
  <BaseOverlay aria-labelledby="task-detail-title" @dismiss="emit('dismiss')">
    <p class="caption overlay-card__eyebrow">{{ faction.selectLabel }} — {{ faction.factionName }}</p>
    <h2 id="task-detail-title">{{ todo.title }}</h2>

    <PrimaryButton variant="navy" @click="emit('dismiss')">Close</PrimaryButton>
  </BaseOverlay>
</template>

<style scoped>
.overlay-card__eyebrow {
  margin: 0 0 8px;
}

h2 {
  margin: 0 0 20px;
  font-family: var(--font-heading);
  font-size: 19px;
  line-height: 1.4;
  color: var(--color-text-primary);
  overflow-wrap: break-word;
}
</style>

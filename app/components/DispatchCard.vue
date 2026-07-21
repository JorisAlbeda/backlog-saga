<script setup lang="ts">
withDefaults(
  defineProps<{
    resultName: string
    resultDetail?: string
    dispatch: string
    sourceTask: string
    dispatchLabel?: string
    compact?: boolean
  }>(),
  { compact: false, dispatchLabel: 'Guild Dispatch' }
)
</script>

<template>
  <article class="dispatch-card" :class="{ 'dispatch-card--compact': compact }">
    <div class="dispatch-card__eyebrow">
      <span class="caption">{{ dispatchLabel }}</span>
      <span class="dispatch-card__success caption">Success</span>
    </div>

    <h3 class="dispatch-card__title">{{ resultName }}</h3>
    <p v-if="resultDetail" class="dispatch-card__material caption">{{ resultDetail }}</p>

    <p class="dispatch-card__body">"{{ dispatch }}"</p>

    <p class="dispatch-card__source caption">Prompted by &mdash; {{ sourceTask }}</p>
  </article>
</template>

<style scoped>
.dispatch-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-subtle);
  border-radius: var(--radius-card);
  padding: var(--spacing-internal-card);
}

.dispatch-card__eyebrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dispatch-card__success {
  color: var(--color-accent);
  font-weight: 700;
}

.dispatch-card__title {
  margin: 8px 0 2px;
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 21px;
  color: var(--color-text-primary);
}

.dispatch-card__material {
  margin: 0 0 12px;
}

.dispatch-card__body {
  margin: 0 0 16px;
  font-family: var(--font-body-italic);
  font-style: italic;
  font-size: 15px;
  line-height: 1.55;
  color: var(--color-text-body);
  white-space: pre-wrap;
}

.dispatch-card__source {
  margin: 0;
}

.dispatch-card--compact {
  padding: 16px;
}

.dispatch-card--compact .dispatch-card__title {
  font-size: 17px;
}

.dispatch-card--compact .dispatch-card__body {
  font-size: 13px;
  margin-bottom: 10px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>

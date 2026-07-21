<script setup lang="ts">
defineEmits<{ click: [] }>()
</script>

<template>
  <button type="button" class="fab" @click="$emit('click')">
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M10 3v14M3 10h14" stroke="#fff" stroke-width="2" stroke-linecap="round" />
    </svg>
    <span>New Task</span>
  </button>
</template>

<style scoped>
.fab {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(calc(-50% + 0px));
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-icon-text-gap);
  border: none;
  border-radius: var(--radius-pill);
  padding: 14px 22px;
  background: var(--color-cta-primary);
  color: var(--color-cta-primary-text);
  font-family: var(--font-caption);
  font-weight: 700;
  font-size: 14px;
  box-shadow: 0 4px 14px rgba(27, 42, 74, 0.28);
  cursor: pointer;
  transition: filter 0.12s ease;
  max-width: calc(402px - 2 * var(--spacing-screen-inset));
}

.fab:hover {
  filter: brightness(1.08);
}

.fab:active {
  filter: brightness(0.92);
}
</style>

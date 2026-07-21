<script setup lang="ts">
defineProps<{
  state: 'empty' | 'in-progress' | 'done'
}>()
</script>

<template>
  <span class="glyph" :class="`glyph--${state}`" aria-hidden="true">
    <svg v-if="state === 'empty'" viewBox="0 0 20 20" width="20" height="20">
      <rect x="1.5" y="1.5" width="17" height="17" rx="3" fill="none" stroke="var(--color-text-primary)" stroke-width="1.5" />
    </svg>
    <svg v-else-if="state === 'in-progress'" viewBox="0 0 20 20" width="20" height="20">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="var(--color-accent)" stroke-width="1.5" />
      <circle cx="10" cy="10" r="4" fill="var(--color-accent)" />
    </svg>
    <svg v-else viewBox="0 0 20 20" width="20" height="20">
      <rect x="1.5" y="1.5" width="17" height="17" rx="3" fill="var(--color-done-check)" />
      <path d="M5.5 10.2l2.7 2.7 6.1-6.1" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </span>
</template>

<style scoped>
.glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
</style>

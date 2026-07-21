<script setup lang="ts">
withDefaults(
  defineProps<{
    variant: 'ledger' | 'chronicle'
  }>(),
  {}
)
</script>

<template>
  <div class="empty-state">
    <div class="empty-state__seal" aria-hidden="true">
      <svg width="56" height="56" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="70" height="70" rx="35" fill="#F3EFE3" />
        <rect x="1" y="1" width="70" height="70" rx="35" stroke="#2A3A4E" stroke-width="2" />
        <path
          d="M42.25 24.75C42.5683 24.3738 42.9621 24.0676 43.4063 23.8509C43.8504 23.6341 44.3351 23.5117 44.8296 23.4913C45.324 23.4709 45.8173 23.553 46.278 23.7324C46.7387 23.9117 47.1567 24.1845 47.5054 24.5332C47.8541 24.8818 48.1258 25.2988 48.3032 25.7576C48.4806 26.2163 48.5598 26.7067 48.5358 27.1975C48.5117 27.6883 48.385 28.1687 48.1636 28.6082C47.9422 29.0477 47.6311 29.4365 47.25 29.75L30.375 46.625L23.5 48.5L25.375 41.625L42.25 24.75Z"
          stroke="#2A3A4E"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <template v-if="variant === 'ledger'">
      <h2>The ledger stands empty</h2>
      <p>
        No commissions are on record. Draft your first task, and the responsible faction will begin its
        work the moment it's done.
      </p>
      <slot />
    </template>

    <template v-else>
      <h2>The Chronicle awaits</h2>
      <p>
        Nothing has been recorded yet. Complete a task in the Ledger, and the first dispatch will
        appear here once it's ready.
      </p>
      <slot />
    </template>
  </div>
</template>

<style scoped>
.empty-state {
  padding: 64px var(--spacing-screen-inset) 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-state__seal {
  margin-bottom: 8px;
}

.empty-state h2 {
  margin: 0;
  font-family: var(--font-heading);
  font-size: 19px;
  color: var(--color-text-primary);
}

.empty-state p {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text-body);
  max-width: 300px;
}
</style>

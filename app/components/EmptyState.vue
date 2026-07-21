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
      <svg viewBox="0 0 64 64" width="56" height="56">
        <circle cx="32" cy="32" r="30" fill="none" stroke="var(--color-accent)" stroke-width="2" />
        <circle cx="32" cy="32" r="23" fill="none" stroke="var(--color-accent)" stroke-width="1" />
        <path d="M22 36l6-14 6 14M24.5 30h7" stroke="var(--color-cta-primary)" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>

    <template v-if="variant === 'ledger'">
      <h2>The ledger stands empty</h2>
      <p>
        No commissions are on record. Draft your first task, and the Construction Guild will begin its work
        the moment it's done.
      </p>
      <slot />
    </template>

    <template v-else>
      <h2>The Chronicle awaits</h2>
      <p>
        Nothing has been built yet. Complete a task in the Ledger, and the Guild's first dispatch will
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

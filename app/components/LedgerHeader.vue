<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    volumeLabel?: string
    subtitle?: string
    linkTo?: string
    linkLabel?: string
  }>(),
  {
    title: 'THE GUILD LEDGER',
    volumeLabel: 'VOL. I',
    subtitle: 'A record of tasks made manifest',
    linkTo: '/chronicle',
    linkLabel: 'Chronicle'
  }
)
</script>

<template>
  <header class="ledger-header">
    <div class="ledger-header__text">
      <p class="caption">{{ volumeLabel }}</p>
      <h1>{{ title }}</h1>
      <p class="ledger-header__subtitle">{{ subtitle }}</p>
    </div>
    <NuxtLink :to="linkTo" class="ledger-header__chronicle-link" :aria-label="`Open the ${linkLabel}`">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M4 5.5C4 4.67 4.67 4 5.5 4H16a3 3 0 0 1 3 3v13H6.5A2.5 2.5 0 0 1 4 17.5v-12Z"
          fill="none"
          stroke="var(--color-text-primary)"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H19" fill="none" stroke="var(--color-text-primary)" stroke-width="1.5" />
      </svg>
      <span class="caption">{{ linkLabel }}</span>
    </NuxtLink>
  </header>
</template>

<style scoped>
.ledger-header {
  min-height: 69px;
  padding: 12px var(--spacing-screen-inset) 8px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.ledger-header__text h1 {
  margin: 2px 0 2px;
  font-family: var(--font-heading);
  font-weight: 700;
  font-size: 20px;
  letter-spacing: 0.03em;
  color: var(--color-text-primary);
}

.ledger-header__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-body);
}

.ledger-header__chronicle-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-decoration: none;
  padding: 4px;
  border-radius: 8px;
}

.ledger-header__chronicle-link:hover {
  filter: brightness(0.9);
}

.ledger-header__chronicle-link .caption {
  font-size: 9px;
}
</style>

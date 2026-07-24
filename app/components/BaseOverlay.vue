<script setup lang="ts">
withDefaults(
  defineProps<{
    ariaLabelledby: string
    center?: boolean
  }>(),
  { center: false }
)

const emit = defineEmits<{ dismiss: [] }>()
</script>

<template>
  <div class="overlay-scrim" role="presentation" @click.self="emit('dismiss')">
    <div
      class="overlay-card"
      :class="{ 'overlay-card--center': center }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="ariaLabelledby"
    >
      <slot />
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

.overlay-card--center {
  text-align: center;
}
</style>

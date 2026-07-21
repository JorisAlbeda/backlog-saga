<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'navy' | 'amber'
    block?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  {
    variant: 'navy',
    block: true,
    disabled: false,
    type: 'button'
  }
)

defineEmits<{ click: [MouseEvent] }>()
</script>

<template>
  <button
    :type="type"
    class="primary-button"
    :class="[`primary-button--${variant}`, { 'primary-button--block': block }]"
    :disabled="disabled"
    @click="(e) => $emit('click', e)"
  >
    <slot />
  </button>
</template>

<style scoped>
.primary-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-icon-text-gap);
  border: none;
  border-radius: var(--radius-pill);
  padding: 16px 28px;
  font-family: var(--font-caption);
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: filter 0.12s ease, opacity 0.12s ease;
}

.primary-button--block {
  width: 100%;
}

.primary-button--navy {
  background: var(--color-cta-primary);
  color: var(--color-cta-primary-text);
}

.primary-button--amber {
  background: var(--color-accent);
  color: var(--color-accent-text-on-accent);
}

.primary-button:hover:not(:disabled) {
  filter: brightness(1.08);
}

.primary-button:active:not(:disabled) {
  filter: brightness(0.92);
}

.primary-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
</style>

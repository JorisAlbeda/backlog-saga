<script setup lang="ts">
import type { Category } from '~~/shared/types'
import { CATEGORIES, FACTIONS } from '~~/shared/factions'

const props = withDefaults(
  defineProps<{
    initialTitle?: string
    initialCategory?: Category
    mode?: 'create' | 'edit'
  }>(),
  { initialTitle: '', initialCategory: undefined, mode: 'create' }
)

const emit = defineEmits<{
  submit: [{ title: string; category: Category }]
  dismiss: []
}>()

const title = ref(props.initialTitle)
const category = ref<Category | ''>(props.initialCategory ?? '')
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  inputRef.value?.focus()
})

function onSubmit() {
  const trimmed = title.value.trim()
  if (!trimmed || !category.value) return
  emit('submit', { title: trimmed, category: category.value })
}
</script>

<template>
  <div class="overlay-scrim" role="presentation" @click.self="emit('dismiss')">
    <form class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="add-task-title" @submit.prevent="onSubmit">
      <p class="caption overlay-card__eyebrow">{{ mode === 'edit' ? 'Edit Task' : 'Draft a Task' }}</p>
      <h2 id="add-task-title">{{ mode === 'edit' ? 'Rename this commission' : 'What needs doing?' }}</h2>

      <input
        ref="inputRef"
        v-model="title"
        type="text"
        class="overlay-card__input"
        placeholder="e.g. Fix the leaking kitchen faucet"
        aria-label="Task title"
      >

      <label class="caption overlay-card__label" for="add-task-category">Category</label>
      <select
        id="add-task-category"
        v-model="category"
        class="overlay-card__input"
        aria-label="Task category"
      >
        <option value="" disabled>Select a category…</option>
        <option v-for="c in CATEGORIES" :key="c" :value="c">{{ FACTIONS[c].selectLabel }}</option>
      </select>

      <PrimaryButton type="submit" variant="navy" :disabled="!title.trim() || !category">
        {{ mode === 'edit' ? 'Save Changes' : 'Add to the Ledger' }}
      </PrimaryButton>
    </form>
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

.overlay-card__eyebrow {
  margin: 0 0 8px;
}

.overlay-card h2 {
  margin: 0 0 16px;
  font-family: var(--font-heading);
  font-size: 19px;
  color: var(--color-text-primary);
}

.overlay-card__input {
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 20px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  font-size: 15px;
  font-family: inherit;
  background: var(--color-bg-base);
  color: var(--color-text-primary);
}

.overlay-card__input:focus {
  outline: 2px solid var(--color-cta-primary);
  outline-offset: 1px;
}

.overlay-card__label {
  display: block;
  margin: 0 0 6px;
}

select.overlay-card__input {
  appearance: auto;
  cursor: pointer;
}
</style>

<script setup lang="ts">
import { currentGuildText, getTaskState, type Todo } from '~~/shared/types'

const props = defineProps<{
  todo: Todo
  lastSyncedAt: number
}>()

const emit = defineEmits<{
  complete: [Todo]
  open: [Todo]
  edit: [Todo]
  remove: [Todo]
}>()

const state = computed(() => getTaskState(props.todo))
const statusText = computed(() => currentGuildText(props.todo))
const interactive = computed(() => state.value === 'todo' || state.value === 'done')

const glyphState = computed(() => {
  if (state.value === 'todo') return 'empty'
  if (state.value === 'taking-shape') return 'in-progress'
  return 'done'
})

const ariaLabel = computed(() => {
  if (state.value === 'todo') return `${props.todo.title}, to do`
  if (state.value === 'taking-shape') return `${props.todo.title}, taking shape — ${statusText.value}`
  return `${props.todo.title}, done — ${props.todo.buildingName ?? 'building'} built`
})

const nowTick = ref(Date.now())
let interval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  interval = setInterval(() => {
    nowTick.value = Date.now()
  }, 5000)
})
onUnmounted(() => {
  if (interval) clearInterval(interval)
})

const lastSyncedLabel = computed(() => {
  const seconds = Math.max(0, Math.round((nowTick.value - props.lastSyncedAt) / 1000))
  if (seconds < 5) return 'Checked just now'
  if (seconds < 60) return `Checked ${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  return `Checked ${minutes}m ago`
})

function onActivate() {
  if (state.value === 'todo') emit('complete', props.todo)
  else if (state.value === 'done') emit('open', props.todo)
}

function onKeydown(e: KeyboardEvent) {
  if (!interactive.value) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    onActivate()
  }
}
</script>

<template>
  <div
    class="task-row"
    :class="`task-row--${state}`"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-label="ariaLabel"
    @click="interactive && onActivate()"
    @keydown="onKeydown"
  >
    <CheckboxGlyph :state="glyphState" />

    <div class="task-row__body">
      <p class="task-row__title">{{ todo.title }}</p>

      <p v-if="state === 'taking-shape'" class="task-row__status">{{ statusText }}</p>
      <p v-if="state === 'taking-shape'" class="task-row__synced caption">{{ lastSyncedLabel }}</p>

      <p v-if="state === 'done'" class="task-row__summary">
        {{ todo.buildingName ?? 'Building' }} - Built
      </p>
    </div>

    <div v-if="state === 'todo'" class="task-row__actions">
      <button
        type="button"
        class="task-row__icon-btn"
        aria-label="Edit task title"
        @click.stop="emit('edit', todo)"
      >
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <path
            d="M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5Zm10.7-8.7a1 1 0 0 0 0-1.4l-1.1-1.1a1 1 0 0 0-1.4 0l-1.2 1.2 2.5 2.5 1.2-1.2Z"
            fill="var(--color-caption)"
          />
        </svg>
      </button>
      <button
        type="button"
        class="task-row__icon-btn"
        aria-label="Delete task"
        @click.stop="emit('remove', todo)"
      >
        <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
          <path
            d="M6 7v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7M4.5 7h11M8 7V5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V7"
            fill="none"
            stroke="var(--color-caption)"
            stroke-width="1.4"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.task-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--spacing-row-internal);
  padding: 0 var(--spacing-row-internal);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  text-align: left;
  font-family: inherit;
}

[role='button'].task-row {
  cursor: pointer;
}

.task-row--todo {
  height: var(--row-height-idle);
}

.task-row--taking-shape {
  height: var(--row-height-taking-shape);
  border-color: var(--color-accent);
  border-width: 1.5px;
  align-items: flex-start;
  padding-top: 12px;
  padding-bottom: 12px;
  animation: pulse-border 2.4s ease-in-out infinite;
}

.task-row--done {
  height: var(--row-height-done);
}

[role='button'].task-row:hover {
  filter: brightness(0.98);
}

[role='button'].task-row:active {
  filter: brightness(0.94);
}

[role='button'].task-row:focus-visible {
  outline: 2px solid var(--color-cta-primary);
  outline-offset: 2px;
}

.task-row__body {
  min-width: 0;
  flex: 1;
}

.task-row__title {
  margin: 0;
  font-size: 15px;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-row__status {
  margin: 4px 0 0;
  font-family: var(--font-body-italic);
  font-style: italic;
  font-size: 13px;
  color: var(--color-accent-text);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-row__synced {
  margin: 4px 0 0;
  font-size: 9px;
}

.task-row__summary {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--color-text-body);
}

.task-row__actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.task-row__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
}

.task-row__icon-btn:hover {
  background: var(--color-bg-base);
}

@keyframes pulse-border {
  0%, 100% { border-color: var(--color-accent); }
  50% { border-color: color-mix(in srgb, var(--color-accent) 45%, var(--color-bg-card)); }
}
</style>

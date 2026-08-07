# Offline PWA Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app run as an installed Android PWA that works fully offline (view, create, edit, complete, reopen, delete todos with no connection), then syncs those changes back to the PC's server automatically once both are on the same home Wi-Fi.

**Architecture:** Local-first. The phone keeps a `localStorage` mirror of the todo list plus an ordered "pending actions" queue. Every mutation tries the real API first; on a network failure it applies optimistically to the local mirror and queues the same request shape the API already accepts today. A foreground reachability poll (plus a Background Sync API registration as a bonus on Android) drains the queue in order once the PC's server responds again. The mutation endpoints become idempotent (already-deleted/already-gone returns success, not a 404) so "did this queued action already apply?" never needs guessing.

**Tech Stack:** Nuxt 4 / Vue 3, Nitro (unstorage `fs` driver), Vitest + `@nuxt/test-utils` (new — no test tooling exists yet), `@vite-pwa/nuxt` (new) for the service worker/manifest, Workbox (`workbox-precaching`) for a custom `injectManifest` service worker that can also handle Background Sync.

## Global Constraints

- Reachability is home-Wi-Fi-only: the phone's health checks and every queued
  action are plain relative-path `$fetch` calls against the PWA's own
  installed origin — no separate PC-address configuration, per the design
  spec.
- Full offline CRUD is in scope (create, edit, complete, reopen, delete),
  not just queuing new todos.
- Target platform is Android; iOS-specific behavior is explicitly out of
  scope.
- Background Sync must never attempt on a cellular connection when
  `navigator.connection.type` is available and indicates cellular — skip
  straight to "still pending" instead of firing a doomed request.
- No action is ever silently dropped: an action is either auto-resolved
  *with a logged reason* (its target was deleted) or left visibly parked as
  `failed` for the user to review.
- The pending/unsynced indicator on a task row must be a distinct icon
  badge with an `aria-label`/tooltip — not a checkbox variant (that channel
  is already used by the taking-shape state) and not color alone.
- Spec source of truth: `docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md`.
- **Test coverage policy (decided with the human partner during the
  pre-flight scan, before Task 1 was dispatched):** every task whose logic
  can be isolated from Nuxt's runtime/browser platform extracts that logic
  into a plain, dependency-free function under `app/utils/` and covers it
  with a Vitest unit test — Tasks 2, 8, 9, and 11 each name the specific
  extraction in their own task text. Logic that is inherently Nuxt-runtime
  glue (`$fetch`/`useState` wiring in `useTodos.ts`) or inherently
  browser-platform behavior with nothing pure to extract (Task 10's PWA
  manifest/service-worker config) stays live-verified only, via Task 12's
  manual pass. This split is a deliberate, already-adjudicated decision,
  not an oversight — if a task review flags a missing test on code that
  falls in the glue/platform category, the controller resolves it directly
  against this note rather than opening a fix loop; a review flagging a
  *named extraction* that was actually skipped is a real finding and goes
  through the normal loop.

---

## File Structure

**New:**
- `test/server/todos-idempotency.e2e.test.ts` — e2e tests for the mutation routes' idempotent behavior, via a real running test server.
- `test/shared/types.test.ts` — unit test for `isTodoNotFound`.
- `test/utils/offlineCache.test.ts` — unit tests for the local `Todo[]` mirror.
- `test/utils/offlineQueue.test.ts` — unit tests for the pending-actions queue logic.
- `test/utils/drainQueue.test.ts` — unit tests for the extracted queue-drain orchestration logic.
- `test/utils/syncStatusLabel.test.ts` — unit tests for the sync-status label logic.
- `test/utils/backgroundSync.test.ts` — unit test for the cellular-skip predicate.
- `app/utils/offlineCache.ts` — `loadCachedTodos()` / `saveCachedTodos()`, fail-soft `localStorage` mirror of the todo list.
- `app/utils/offlineQueue.ts` — `PendingAction` type, queue load/save, the create+delete collapsing rule, the optimistic-apply function, and the network-vs-HTTP-error classifier.
- `app/utils/drainQueue.ts` — pure `drainActions()` orchestration (network failure stops the whole pass; a real HTTP error from a reachable server only parks that one action and the rest keep draining), with the network calls injected so it's testable without a server. Used by `useTodos.ts`.
- `app/utils/syncStatusLabel.ts` — pure `computeSyncStatusLabel()`, the branching behind the header status text. Used by `SyncStatus.vue`.
- `app/utils/backgroundSync.ts` — pure `shouldAttemptBackgroundSync()` predicate (the cellular-skip rule). Used by `useTodos.ts`'s Background Sync registration.
- `app/components/SyncStatus.vue` — header status indicator (pending count / syncing / all synced / failed), tappable to force a sync attempt.
- `service-worker/sw.ts` — custom Workbox `injectManifest` service worker source: precaching plus the `sync` event listener that pings open clients to drain the queue.
- `public/pwa-icon.png` — not created (reusing existing `public/favicon.svg` and `public/favicon.png` as manifest icons — see Task 10).

**Modified:**
- `shared/types.ts` — add `TodoNotFound` type + `isTodoNotFound` guard.
- `server/utils/store.ts` — `createTodo` accepts an optional client-supplied `id`, idempotently.
- `server/api/todos/index.post.ts` — accept and validate optional `id` in the body.
- `server/api/todos/[id].patch.ts` — return `200 { id, status: 'not-found' }` instead of throwing 404 when the todo doesn't exist.
- `server/api/todos/[id].delete.ts` — always return `200 { ok: true }`, even when the todo was already gone.
- `app/composables/useTodos.ts` — offline-aware dispatch for every mutation (new `editTodo`, all existing mutations wrapped), local cache hydration/persistence, pending-actions state, `drainQueue`/`forceSync`, reachability polling, Background Sync registration.
- `app/components/TaskRow.vue` — accept a `pending` prop and render the sync-pending icon badge.
- `app/pages/index.vue` — use `editTodo` instead of a raw inline `$fetch`, pass `pending` down to `TaskRow`, render `SyncStatus`.
- `nuxt.config.ts` — configurable storage base (`DATA_DIR` env var, for test isolation), `@vite-pwa/nuxt` module + config, `routeRules` SPA override for `/`.
- `package.json` — `test` script, new devDependencies.
- `README.md` — short "Offline / installing as an app" section.

---

### Task 1: Test tooling — Vitest + isolated storage for route tests

**Files:**
- Modify: `package.json`
- Modify: `nuxt.config.ts`
- Create: `vitest.config.ts`
- Create: `test/server/smoke.e2e.test.ts`

**Interfaces:**
- Produces: `process.env.DATA_DIR` — when set, `nuxt.config.ts`'s Nitro storage base resolves against it instead of the default `./.data/db`, exactly mirroring the existing `CODEX_DIR` pattern already in the file. Every later e2e test file relies on this to avoid touching real data.

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @nuxt/test-utils happy-dom
```

- [ ] **Step 2: Make the Nitro storage base configurable for test isolation**

In `nuxt.config.ts`, change:

```ts
    storage: {
      data: { driver: 'fs', base: './.data/db' }
    }
```

to:

```ts
    storage: {
      // Overridable so test runs can point storage at an isolated temp
      // directory instead of the real .data/db — same pattern as CODEX_DIR
      // above, resolved once here against this file's own directory.
      data: { driver: 'fs', base: process.env.DATA_DIR ? resolve(rootDir, process.env.DATA_DIR) : './.data/db' }
    }
```

- [ ] **Step 3: Add the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'node'
  }
})
```

(`node`, not `happy-dom`, as the default: `@nuxt/test-utils/e2e`'s `setup()` needs Node built-ins that a browser-simulating environment can't bundle. Tasks 5 and 6's tests use `localStorage`, so they opt into `happy-dom` per-file instead, via a `// @vitest-environment happy-dom` docblock at the top of those two test files specifically — see those tasks.)

- [ ] **Step 4: Add the `test` script**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run"
```

- [ ] **Step 5: Write a smoke test proving the e2e harness works end-to-end**

Create `test/server/smoke.e2e.test.ts`. Set `process.env.DATA_DIR` directly rather than via `setup()`'s `env` option: `@nuxt/test-utils`'s `setup()` builds Nuxt in-process before ever spawning the runtime server, and `nuxt.config.ts` resolves `DATA_DIR` at that build step — `setup()`'s `env` option only reaches the *spawned server's* environment, which is too late; the storage path is already baked into the build by then. Mutating `process.env.DATA_DIR` before calling `setup()` (with no arguments) means the build step itself sees it.

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))
process.env.DATA_DIR = dataDir

await setup()

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('smoke test', () => {
  it('GET /api/todos returns an empty list against isolated storage', async () => {
    const todos = await $fetch('/api/todos')
    expect(todos).toEqual([])
  })
})
```

- [ ] **Step 6: Run it to confirm the harness works**

Run: `npm test`
Expected: PASS (the first run will take a while — it builds the app to spin up the test server; this is normal).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json nuxt.config.ts vitest.config.ts test/server/smoke.e2e.test.ts
git commit -m "test: add Vitest + isolated-storage e2e test harness"
```

---

### Task 2: Idempotent PATCH — return a not-found marker instead of a 404

**Files:**
- Modify: `shared/types.ts`
- Modify: `server/api/todos/[id].patch.ts`
- Test: `test/server/todos-idempotency.e2e.test.ts`

**Interfaces:**
- Produces: `TodoNotFound { id: string; status: 'not-found' }` and `isTodoNotFound(value: Todo | TodoNotFound): value is TodoNotFound` from `shared/types.ts` — used by every later task that reads a PATCH response (the client dispatch layer in Task 7, and the queue drain in Task 8).

- [ ] **Step 0: Write the failing unit test for the type guard**

Create `test/shared/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isTodoNotFound } from '../../shared/types'
import type { Todo } from '../../shared/types'

const sampleTodo: Todo = {
  id: 't1',
  title: 'Fix the fence post',
  createdAt: '2026-08-01T00:00:00.000Z',
  completedAt: null,
  guildStatus: 'init',
  category: 'home-improvement',
  text: { init: 'A construction guild task awaits.' },
  chronicleWritten: false,
  version: 1
}

describe('isTodoNotFound', () => {
  it('is true for a not-found marker', () => {
    expect(isTodoNotFound({ id: 't1', status: 'not-found' })).toBe(true)
  })

  it('is false for a real Todo', () => {
    expect(isTodoNotFound(sampleTodo)).toBe(false)
  })
})
```

Run: `npm test -- types.test`
Expected: FAIL with a module-not-found error (`isTodoNotFound` doesn't exist yet).

- [ ] **Step 1: Write the failing e2e test**

Create `test/server/todos-idempotency.e2e.test.ts`. As in Task 1's smoke test, set `process.env.DATA_DIR` directly before calling `setup()` — `setup()`'s own `env` option only reaches the spawned runtime server, too late for the build step that resolves the storage path:

```ts
import { describe, it, expect, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dataDir = mkdtempSync(join(tmpdir(), 'backlog-saga-test-'))
process.env.DATA_DIR = dataDir

await setup()

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

describe('idempotent mutation endpoints', () => {
  it('PATCH on a missing id returns 200 with a not-found marker, not a 404', async () => {
    const result = await $fetch('/api/todos/does-not-exist', {
      method: 'PATCH',
      body: { title: 'new title' }
    })
    expect(result).toEqual({ id: 'does-not-exist', status: 'not-found' })
  })

  it('PATCH complete on a missing id also returns the not-found marker', async () => {
    const result = await $fetch('/api/todos/also-missing', {
      method: 'PATCH',
      body: { action: 'complete' }
    })
    expect(result).toEqual({ id: 'also-missing', status: 'not-found' })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- todos-idempotency`
Expected: FAIL — the current handler throws a 404, so `$fetch` rejects instead of resolving.

- [ ] **Step 3: Add the shared `TodoNotFound` type**

In `shared/types.ts`, after the `Todo` interface, add:

```ts
// Returned instead of a Todo by the mutation endpoints (PATCH/DELETE) when
// the target id doesn't exist — these endpoints are idempotent by design
// (see docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md), so
// "already gone" is a successful outcome, not an error. Distinguishable
// from a real Todo by the `status` field, which no Todo has.
export interface TodoNotFound {
  id: string
  status: 'not-found'
}

export function isTodoNotFound(value: Todo | TodoNotFound): value is TodoNotFound {
  return 'status' in value && value.status === 'not-found'
}
```

- [ ] **Step 4: Make the PATCH handler idempotent**

In `server/api/todos/[id].patch.ts`, change the import and the not-found branch:

```ts
import type { Category, Todo, TodoNotFound } from '../../../shared/types'
```

```ts
  if (!updated) {
    return { id, status: 'not-found' } satisfies TodoNotFound
  }
  return updated
```

(replacing the existing `throw createError({ statusCode: 404, ... })` block.)

- [ ] **Step 5: Run both the unit test and the e2e test to verify they pass**

Run: `npm test -- types.test`
Expected: PASS (both `isTodoNotFound` tests).

Run: `npm test -- todos-idempotency`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts server/api/todos/[id].patch.ts test/shared/types.test.ts test/server/todos-idempotency.e2e.test.ts
git commit -m "feat: make PATCH /api/todos/:id idempotent for missing ids"
```

---

### Task 3: Idempotent DELETE

**Files:**
- Modify: `server/api/todos/[id].delete.ts`
- Test: `test/server/todos-idempotency.e2e.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DELETE /api/todos/:id` now always resolves `{ ok: true }` with a 200, whether or not the id existed.

- [ ] **Step 1: Write the failing test**

Add to `test/server/todos-idempotency.e2e.test.ts`, inside the existing `describe` block:

```ts
  it('DELETE on a missing id returns 200 ok, not a 404', async () => {
    const result = await $fetch('/api/todos/never-existed', { method: 'DELETE' })
    expect(result).toEqual({ ok: true })
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- todos-idempotency`
Expected: FAIL — current handler throws a 404 for a missing id.

- [ ] **Step 3: Make the DELETE handler idempotent**

Replace the full body of `server/api/todos/[id].delete.ts`:

```ts
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'id is required' })
  }
  // Idempotent: the desired end state ("this todo doesn't exist") is
  // already true whether or not it existed a moment ago, so there's
  // nothing to distinguish in the response either way.
  await deleteTodo(id)
  return { ok: true }
})
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- todos-idempotency`
Expected: PASS (all three tests in the file).

- [ ] **Step 5: Commit**

```bash
git add server/api/todos/[id].delete.ts test/server/todos-idempotency.e2e.test.ts
git commit -m "feat: make DELETE /api/todos/:id idempotent for missing ids"
```

---

### Task 4: Client-supplied id support for offline-created todos

**Files:**
- Modify: `server/utils/store.ts`
- Modify: `server/api/todos/index.post.ts`
- Test: `test/server/todos-idempotency.e2e.test.ts`

**Interfaces:**
- Produces: `createTodo(title: string, category: Category, id?: string): Promise<Todo>` — when `id` is given and already exists, returns the existing todo instead of creating a duplicate (idempotent create, needed so a queued `create` action retried after a lost response doesn't double-create).
- Produces: `POST /api/todos` accepts an optional `id` string in the body.

- [ ] **Step 1: Write the failing tests**

Add to `test/server/todos-idempotency.e2e.test.ts`:

```ts
  it('POST with a client-supplied id uses that id', async () => {
    const created = await $fetch('/api/todos', {
      method: 'POST',
      body: { id: 'phone-generated-id-1', title: 'Offline todo', category: 'cleaning' }
    })
    expect(created.id).toBe('phone-generated-id-1')
  })

  it('retrying a create with the same id returns the existing todo, not a duplicate', async () => {
    const first = await $fetch('/api/todos', {
      method: 'POST',
      body: { id: 'phone-generated-id-2', title: 'Retry me', category: 'health' }
    })
    const retried = await $fetch('/api/todos', {
      method: 'POST',
      body: { id: 'phone-generated-id-2', title: 'Retry me', category: 'health' }
    })
    expect(retried).toEqual(first)

    const all = await $fetch('/api/todos')
    expect(all.filter((t: { id: string }) => t.id === 'phone-generated-id-2')).toHaveLength(1)
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- todos-idempotency`
Expected: FAIL — `createTodo` doesn't accept/use a supplied id yet, so `created.id` is a random UUID and the retry creates a second row.

- [ ] **Step 3: Update `createTodo` to accept and honor a client-supplied id**

In `server/utils/store.ts`, replace `createTodo`:

```ts
export async function createTodo(title: string, category: Category, id?: string): Promise<Todo> {
  return withLock(async () => {
    const todos = await listTodos()
    if (id) {
      const existing = todos.find(t => t.id === id)
      // Idempotent: a queued offline create retried after its first
      // response was lost must not produce a second row.
      if (existing) return existing
    }
    const todo: Todo = {
      id: id ?? crypto.randomUUID(),
      title,
      createdAt: new Date().toISOString(),
      completedAt: null,
      category,
      ...initialGuildState(category),
      version: 1
    }
    todos.push(todo)
    await saveTodos(todos)
    return todo
  })
}
```

- [ ] **Step 4: Accept the optional id in the POST route**

In `server/api/todos/index.post.ts`, replace the body:

```ts
import type { Category } from '../../../shared/types'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ id?: string; title?: string; category?: Category }>(event)
  const title = body?.title?.trim()
  if (!title) {
    throw createError({ statusCode: 400, statusMessage: 'title is required' })
  }
  const category = body?.category
  assertValidCategory(category)

  let id: string | undefined
  if (body?.id !== undefined) {
    if (typeof body.id !== 'string' || !body.id.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'id must be a non-empty string if provided' })
    }
    id = body.id
  }

  return createTodo(title, category, id)
})
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- todos-idempotency`
Expected: PASS (all five tests in the file).

- [ ] **Step 6: Commit**

```bash
git add server/utils/store.ts server/api/todos/index.post.ts test/server/todos-idempotency.e2e.test.ts
git commit -m "feat: support idempotent client-supplied ids on todo creation"
```

---

### Task 5: Local cache — `app/utils/offlineCache.ts`

**Files:**
- Create: `app/utils/offlineCache.ts`
- Test: `test/utils/offlineCache.test.ts`

**Interfaces:**
- Produces: `loadCachedTodos(): Todo[]`, `saveCachedTodos(todos: Todo[]): void` — used by Task 7 (`useTodos.ts`) to hydrate on cold start and persist on every change.

- [ ] **Step 1: Write the failing tests**

Create `test/utils/offlineCache.test.ts`. This file uses `localStorage`, which the project's default Vitest environment (`node`, set in Task 1) doesn't provide — the `// @vitest-environment happy-dom` docblock on the first line opts just this file into a DOM-simulating environment:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { loadCachedTodos, saveCachedTodos } from '../../app/utils/offlineCache'
import type { Todo } from '../../shared/types'

const sampleTodo: Todo = {
  id: 't1',
  title: 'Fix the fence post',
  createdAt: '2026-08-01T00:00:00.000Z',
  completedAt: null,
  guildStatus: 'init',
  category: 'home-improvement',
  text: { init: 'A construction guild task awaits.' },
  chronicleWritten: false,
  version: 1
}

beforeEach(() => {
  localStorage.clear()
})

describe('offlineCache', () => {
  it('returns an empty array when nothing is cached', () => {
    expect(loadCachedTodos()).toEqual([])
  })

  it('round-trips a saved todo list', () => {
    saveCachedTodos([sampleTodo])
    expect(loadCachedTodos()).toEqual([sampleTodo])
  })

  it('fails soft on corrupt stored JSON instead of throwing', () => {
    localStorage.setItem('backlog-saga:todos-cache', '{not valid json')
    expect(loadCachedTodos()).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- offlineCache`
Expected: FAIL with a module-not-found error (`app/utils/offlineCache.ts` doesn't exist yet).

- [ ] **Step 3: Implement the cache module**

Create `app/utils/offlineCache.ts`:

```ts
import type { Todo } from '~~/shared/types'

const CACHE_KEY = 'backlog-saga:todos-cache'

export function loadCachedTodos(): Todo[] {
  const raw = localStorage.getItem(CACHE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    // Corrupt cache shouldn't crash the app — treat it as empty and let
    // the next successful sync repopulate it.
    return []
  }
}

export function saveCachedTodos(todos: Todo[]): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(todos))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- offlineCache`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/offlineCache.ts test/utils/offlineCache.test.ts
git commit -m "feat: add local-storage cache for the offline todo mirror"
```

---

### Task 6: Pending-actions queue — `app/utils/offlineQueue.ts`

**Files:**
- Create: `app/utils/offlineQueue.ts`
- Test: `test/utils/offlineQueue.test.ts`

**Interfaces:**
- Consumes: `Todo`, `Category` from `shared/types.ts`; `FACTIONS` from `shared/factions.ts`.
- Produces:
  - `type PendingAction = { type: 'create', tempId: string, title: string, category: Category, status: 'pending' | 'failed' } | { type: 'patch', id: string, title?: string, category?: Category, status: 'pending' | 'failed' } | { type: 'complete' | 'reopen', id: string, status: 'pending' | 'failed' } | { type: 'delete', id: string, status: 'pending' | 'failed' }`
  - `loadQueue(): PendingAction[]`, `saveQueue(actions: PendingAction[]): void`
  - `enqueueAction(queue: PendingAction[], action: PendingAction): PendingAction[]` — pure, applies the create+delete collapsing rule.
  - `applyActionOptimistically(todos: Todo[], action: PendingAction): Todo[]` — pure.
  - `isNetworkFailure(err: unknown): boolean` — used by Task 7/8 to distinguish "PC unreachable" from "PC responded with an error."

- [ ] **Step 1: Write the failing tests**

Create `test/utils/offlineQueue.test.ts`. Like Task 5's cache test, this file uses `localStorage`, so it needs the same per-file environment override:

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadQueue,
  saveQueue,
  enqueueAction,
  applyActionOptimistically,
  isNetworkFailure,
  type PendingAction
} from '../../app/utils/offlineQueue'
import type { Todo } from '../../shared/types'

beforeEach(() => {
  localStorage.clear()
})

describe('offlineQueue storage', () => {
  it('returns an empty array when nothing is queued', () => {
    expect(loadQueue()).toEqual([])
  })

  it('round-trips a saved queue', () => {
    const action: PendingAction = { type: 'delete', id: 't1', status: 'pending' }
    saveQueue([action])
    expect(loadQueue()).toEqual([action])
  })

  it('fails soft on corrupt stored JSON', () => {
    localStorage.setItem('backlog-saga:pending-actions', 'nope')
    expect(loadQueue()).toEqual([])
  })
})

describe('enqueueAction', () => {
  it('appends a new action to the end of the queue', () => {
    const queue: PendingAction[] = [{ type: 'delete', id: 't1', status: 'pending' }]
    const next = enqueueAction(queue, { type: 'complete', id: 't2', status: 'pending' })
    expect(next).toEqual([
      { type: 'delete', id: 't1', status: 'pending' },
      { type: 'complete', id: 't2', status: 'pending' }
    ])
  })

  it('collapses a create+delete pair for a todo that never synced', () => {
    const queue: PendingAction[] = [
      { type: 'create', tempId: 'temp-1', title: 'Scratch idea', category: 'cleaning', status: 'pending' },
      { type: 'patch', id: 'temp-1', title: 'Renamed', status: 'pending' }
    ]
    const next = enqueueAction(queue, { type: 'delete', id: 'temp-1', status: 'pending' })
    expect(next).toEqual([])
  })

  it('does not collapse a delete for a todo that already exists server-side', () => {
    const queue: PendingAction[] = [{ type: 'patch', id: 'server-id-1', title: 'Renamed', status: 'pending' }]
    const next = enqueueAction(queue, { type: 'delete', id: 'server-id-1', status: 'pending' })
    expect(next).toEqual([
      { type: 'patch', id: 'server-id-1', title: 'Renamed', status: 'pending' },
      { type: 'delete', id: 'server-id-1', status: 'pending' }
    ])
  })
})

describe('applyActionOptimistically', () => {
  it('adds a new todo for a create action', () => {
    const result = applyActionOptimistically([], {
      type: 'create',
      tempId: 'temp-1',
      title: 'Offline idea',
      category: 'health',
      status: 'pending'
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'temp-1',
      title: 'Offline idea',
      category: 'health',
      completedAt: null,
      guildStatus: 'init'
    })
  })

  it('updates title/category for a patch action', () => {
    const todo: Todo = {
      id: 't1',
      title: 'Old title',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: null,
      guildStatus: 'init',
      category: 'cleaning',
      text: { init: 'x' },
      chronicleWritten: false,
      version: 1
    }
    const result = applyActionOptimistically([todo], { type: 'patch', id: 't1', title: 'New title', status: 'pending' })
    expect(result[0].title).toBe('New title')
  })

  it('sets completedAt for a complete action and clears it for reopen', () => {
    const todo: Todo = {
      id: 't1',
      title: 'x',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: null,
      guildStatus: 'init',
      category: 'cleaning',
      text: { init: 'x' },
      chronicleWritten: false,
      version: 1
    }
    const completed = applyActionOptimistically([todo], { type: 'complete', id: 't1', status: 'pending' })
    expect(completed[0].completedAt).not.toBeNull()

    const reopened = applyActionOptimistically(completed, { type: 'reopen', id: 't1', status: 'pending' })
    expect(reopened[0].completedAt).toBeNull()
  })

  it('removes the todo for a delete action', () => {
    const todo: Todo = {
      id: 't1',
      title: 'x',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: null,
      guildStatus: 'init',
      category: 'cleaning',
      text: { init: 'x' },
      chronicleWritten: false,
      version: 1
    }
    expect(applyActionOptimistically([todo], { type: 'delete', id: 't1', status: 'pending' })).toEqual([])
  })
})

describe('isNetworkFailure', () => {
  it('treats an error with no response as a network failure', () => {
    expect(isNetworkFailure(new Error('fetch failed'))).toBe(true)
  })

  it('treats an error with a response as a real HTTP error, not a network failure', () => {
    const httpError = Object.assign(new Error('400'), { response: { status: 400 } })
    expect(isNetworkFailure(httpError)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- offlineQueue`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Implement the queue module**

Create `app/utils/offlineQueue.ts`:

```ts
import type { Category, Todo } from '~~/shared/types'
import { FACTIONS } from '~~/shared/factions'

export type PendingAction =
  | { type: 'create', tempId: string, title: string, category: Category, status: 'pending' | 'failed' }
  | { type: 'patch', id: string, title?: string, category?: Category, status: 'pending' | 'failed' }
  | { type: 'complete' | 'reopen', id: string, status: 'pending' | 'failed' }
  | { type: 'delete', id: string, status: 'pending' | 'failed' }

const QUEUE_KEY = 'backlog-saga:pending-actions'

function targetId(action: PendingAction): string {
  return action.type === 'create' ? action.tempId : action.id
}

export function loadQueue(): PendingAction[] {
  const raw = localStorage.getItem(QUEUE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveQueue(actions: PendingAction[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(actions))
}

// A delete for a todo that was created offline and never synced means the
// server never needs to know it existed at all — drop both the create and
// every action queued against it instead of round-tripping a
// create-then-immediate-delete once reconnected.
export function enqueueAction(queue: PendingAction[], action: PendingAction): PendingAction[] {
  if (action.type === 'delete') {
    const createIdx = queue.findIndex(a => a.type === 'create' && a.tempId === action.id)
    if (createIdx !== -1) {
      return queue.filter(a => targetId(a) !== action.id)
    }
  }
  return [...queue, action]
}

// What the local cache should look like immediately after queuing this
// action, so the UI reflects your intent right away instead of waiting for
// a sync that might not happen for hours.
export function applyActionOptimistically(todos: Todo[], action: PendingAction): Todo[] {
  switch (action.type) {
    case 'create': {
      const todo: Todo = {
        id: action.tempId,
        title: action.title,
        createdAt: new Date().toISOString(),
        completedAt: null,
        guildStatus: 'init',
        category: action.category,
        text: { init: FACTIONS[action.category].initTemplate },
        chronicleWritten: false,
        version: 1
      }
      return [...todos, todo]
    }
    case 'patch': {
      return todos.map(t =>
        t.id === action.id
          ? { ...t, ...(action.title !== undefined ? { title: action.title } : {}), ...(action.category !== undefined ? { category: action.category } : {}) }
          : t
      )
    }
    case 'complete': {
      return todos.map(t => (t.id === action.id ? { ...t, completedAt: new Date().toISOString() } : t))
    }
    case 'reopen': {
      return todos.map(t =>
        t.id === action.id
          ? {
              ...t,
              completedAt: null,
              guildStatus: 'init',
              subtype: undefined,
              text: { init: FACTIONS[t.category].initTemplate },
              resultName: undefined,
              resultDetail: undefined,
              chronicleWritten: false
            }
          : t
      )
    }
    case 'delete': {
      return todos.filter(t => t.id !== action.id)
    }
  }
}

// ofetch's FetchError carries a `.response` when the server actually
// responded (a real HTTP error status); a genuine network failure (PC
// unreachable) has none. That distinction is what decides whether a
// mutation should queue for later (network failure) or surface as a real
// error right now (an HTTP error from a reachable server) — see
// docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md.
export function isNetworkFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return !('response' in err && (err as { response?: unknown }).response)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- offlineQueue`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/offlineQueue.ts test/utils/offlineQueue.test.ts
git commit -m "feat: add the pending-actions offline queue"
```

---

### Task 7: Wire `useTodos.ts` for offline-aware dispatch

**Files:**
- Modify: `app/composables/useTodos.ts`
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes: `loadCachedTodos`/`saveCachedTodos` (Task 5), `PendingAction`/`loadQueue`/`saveQueue`/`enqueueAction`/`applyActionOptimistically`/`isNetworkFailure` (Task 6), `TodoNotFound`/`isTodoNotFound` (Task 2).
- Produces: `useTodos()` now also returns `pendingActions: Ref<PendingAction[]>`, `pendingIds: ComputedRef<Set<string>>`, and a new `editTodo(id: string, title: string, category: Category): Promise<void>` — consumed by Task 8 (drain/reachability) and Task 9 (UI badge/status).

This task has no dedicated automated test: it's glue between already-tested pure functions (Tasks 5/6) and Nuxt's `$fetch`/`useState`, which — consistent with how every other UI feature in this codebase has been verified — gets a live check in Task 12 rather than a mocked component test.

- [ ] **Step 1: Hydrate from cache and persist on every change**

In `app/composables/useTodos.ts`, add imports and hydrate/persist logic. Replace the top of the file:

```ts
import type { Category, Todo, TodoNotFound } from '~~/shared/types'
import { isTodoNotFound } from '~~/shared/types'
import { loadCachedTodos, saveCachedTodos } from '../utils/offlineCache'
import {
  type PendingAction,
  loadQueue,
  saveQueue,
  enqueueAction,
  applyActionOptimistically,
  isNetworkFailure
} from '../utils/offlineQueue'

let pollHandle: ReturnType<typeof setInterval> | undefined

export function useTodos() {
  const todos = useState<Todo[]>('todos', () => [])
  const lastSyncedAt = useState<number>('todos-last-synced', () => Date.now())
  const loading = useState<boolean>('todos-loading', () => false)
  const pendingActions = useState<PendingAction[]>('todos-pending-actions', () => [])

  // Cold start: show whatever we last knew before the first refresh()
  // resolves, so opening the app offline isn't a blank screen.
  if (import.meta.client && todos.value.length === 0) {
    const cached = loadCachedTodos()
    if (cached.length > 0) todos.value = cached
  }
  if (import.meta.client && pendingActions.value.length === 0) {
    pendingActions.value = loadQueue()
  }

  const pendingIds = computed(() => new Set(pendingActions.value.map(a => (a.type === 'create' ? a.tempId : a.id))))

  function persistCache() {
    if (import.meta.client) saveCachedTodos(todos.value)
  }

  function persistQueue() {
    if (import.meta.client) saveQueue(pendingActions.value)
  }

  function queueAndApplyOptimistically(action: PendingAction) {
    pendingActions.value = enqueueAction(pendingActions.value, action)
    todos.value = applyActionOptimistically(todos.value, action)
    persistQueue()
    persistCache()
  }
```

- [ ] **Step 2: Wrap `refresh` to also persist the cache**

Replace `refresh`:

```ts
  async function refresh() {
    loading.value = true
    try {
      todos.value = await $fetch<Todo[]>('/api/todos')
      lastSyncedAt.value = Date.now()
      persistCache()
    } finally {
      loading.value = false
    }
  }
```

- [ ] **Step 3: Make `createTodo` offline-aware**

Replace `createTodo`:

```ts
  async function createTodo(title: string, category: Category) {
    const tempId = crypto.randomUUID()
    try {
      const todo = await $fetch<Todo>('/api/todos', { method: 'POST', body: { id: tempId, title, category } })
      todos.value = [...todos.value, todo]
      persistCache()
      return todo
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      const action: PendingAction = { type: 'create', tempId, title, category, status: 'pending' }
      queueAndApplyOptimistically(action)
      return todos.value.find(t => t.id === tempId)!
    }
  }
```

- [ ] **Step 4: Add `editTodo` (currently done inline in `index.vue` via a raw `$fetch` — moving it here so it goes through the same offline dispatch path as every other mutation)**

Add a new exported function, after `createTodo`:

```ts
  async function editTodo(id: string, title: string, category: Category) {
    try {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${id}`, { method: 'PATCH', body: { title, category } })
      if (isTodoNotFound(result)) {
        todos.value = todos.value.filter(t => t.id !== id)
      } else {
        todos.value = todos.value.map(t => (t.id === id ? result : t))
      }
      persistCache()
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'patch', id, title, category, status: 'pending' })
    }
  }
```

- [ ] **Step 5: Make `completeTodo`/`reopenTodo` offline-aware and handle the not-found marker**

Replace both:

```ts
  async function completeTodo(id: string) {
    try {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${id}`, { method: 'PATCH', body: { action: 'complete' } })
      if (isTodoNotFound(result)) {
        todos.value = todos.value.filter(t => t.id !== id)
        persistCache()
        return undefined
      }
      todos.value = todos.value.map(t => (t.id === id ? result : t))
      persistCache()
      return result
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'complete', id, status: 'pending' })
      return todos.value.find(t => t.id === id)
    }
  }

  async function reopenTodo(id: string) {
    try {
      const result = await $fetch<Todo | TodoNotFound>(`/api/todos/${id}`, { method: 'PATCH', body: { action: 'reopen' } })
      if (isTodoNotFound(result)) {
        todos.value = todos.value.filter(t => t.id !== id)
        persistCache()
        return undefined
      }
      todos.value = todos.value.map(t => (t.id === id ? result : t))
      persistCache()
      return result
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'reopen', id, status: 'pending' })
      return todos.value.find(t => t.id === id)
    }
  }
```

- [ ] **Step 6: Make `removeTodo` offline-aware**

Replace `removeTodo`:

```ts
  async function removeTodo(id: string) {
    try {
      await $fetch(`/api/todos/${id}`, { method: 'DELETE' })
      todos.value = todos.value.filter(t => t.id !== id)
      persistCache()
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      queueAndApplyOptimistically({ type: 'delete', id, status: 'pending' })
    }
  }
```

- [ ] **Step 7: Return the new fields**

Update the final returned object to include `pendingActions`, `pendingIds`, and `editTodo`:

```ts
  return {
    todos,
    lastSyncedAt,
    loading,
    pendingActions,
    pendingIds,
    refresh,
    createTodo,
    editTodo,
    completeTodo,
    reopenTodo,
    removeTodo,
    startPolling,
    stopPolling
  }
```

- [ ] **Step 8: Switch `index.vue`'s edit path to use `editTodo` instead of a raw `$fetch`**

In `app/pages/index.vue`, destructure `editTodo` alongside the other methods:

```ts
const {
  todos,
  lastSyncedAt,
  refresh,
  createTodo,
  editTodo,
  completeTodo,
  removeTodo,
  startPolling,
  stopPolling,
} = useTodos()
```

Replace the body of `handleAddSubmit`'s edit branch:

```ts
  if (editingTodo.value) {
    await editTodo(editingTodo.value.id, title, category)
    editingTodo.value = null
  } else {
```

(leaving the existing `else` branch — `showAddOverlay.value = false` etc. — unchanged, and dropping the now-redundant `try { ... } catch (err) { console.error(...) } finally { await refresh() }` around the old raw `$fetch` call, since `editTodo` already updates `todos.value` directly and offline-queues on failure instead of needing a post-hoc `refresh()`.)

- [ ] **Step 9: Run the full test suite to make sure nothing broke**

Run: `npm test`
Expected: PASS (all existing tests, no regressions).

- [ ] **Step 10: Commit**

```bash
git add app/composables/useTodos.ts app/pages/index.vue
git commit -m "feat: route all todo mutations through offline-aware dispatch"
```

---

### Task 8: Reachability polling, queue drain, and forced sync

**Files:**
- Modify: `app/composables/useTodos.ts`

**Interfaces:**
- Consumes: everything from Task 7's `useTodos.ts` state.
- Produces: `drainActions(actions: PendingAction[], replay: (action: PendingAction) => Promise<void>, describeAction: (action: PendingAction) => string): Promise<{ remaining: PendingAction[], resolvedMessages: string[], failedMessages: string[], stoppedEarly: boolean }>` from `app/utils/drainQueue.ts` — the actual drain branching logic, kept free of `$fetch`/Vue state so it's unit-testable with a fake `replay`. `useTodos()` additionally returns `syncStatus: Ref<'idle' | 'syncing'>`, `failedCount: ComputedRef<number>`, `syncReport: Ref<{ message: string, at: string }[]>`, `forceSync(): Promise<void>` — consumed by Task 9's `SyncStatus.vue` and Task 11's Background Sync handler.

- [ ] **Step 1: Write the failing unit tests for the drain orchestration logic**

Create `test/utils/drainQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { drainActions } from '../../app/utils/drainQueue'
import type { PendingAction } from '../../app/utils/offlineQueue'

function describeAction(action: PendingAction): string {
  return action.type
}

describe('drainActions', () => {
  it('resolves an action successfully and removes it from the queue', async () => {
    const actions: PendingAction[] = [{ type: 'delete', id: 't1', status: 'pending' }]
    const result = await drainActions(actions, async () => {}, describeAction)
    expect(result.remaining).toEqual([])
    expect(result.resolvedMessages).toEqual(['Synced: delete'])
    expect(result.stoppedEarly).toBe(false)
  })

  it('stops the whole drain on a network failure and leaves remaining actions queued', async () => {
    const actions: PendingAction[] = [
      { type: 'delete', id: 't1', status: 'pending' },
      { type: 'complete', id: 't2', status: 'pending' }
    ]
    const networkError = new Error('fetch failed')
    const result = await drainActions(actions, async () => { throw networkError }, describeAction)
    expect(result.remaining).toEqual(actions)
    expect(result.resolvedMessages).toEqual([])
    expect(result.stoppedEarly).toBe(true)
  })

  it('marks an action failed on a non-network error and keeps draining the rest', async () => {
    const actions: PendingAction[] = [
      { type: 'complete', id: 't1', status: 'pending' },
      { type: 'delete', id: 't2', status: 'pending' }
    ]
    const httpError = Object.assign(new Error('400'), { response: { status: 400 } })
    const result = await drainActions(
      actions,
      async (action) => {
        if (action.type === 'complete') throw httpError
      },
      describeAction
    )
    expect(result.remaining).toEqual([{ type: 'complete', id: 't1', status: 'failed' }])
    expect(result.resolvedMessages).toEqual(['Synced: delete'])
    expect(result.failedMessages).toEqual(['Failed to sync: complete'])
    expect(result.stoppedEarly).toBe(false)
  })

  it('leaves already-failed actions untouched and does not retry them', async () => {
    const actions: PendingAction[] = [{ type: 'delete', id: 't1', status: 'failed' }]
    const result = await drainActions(actions, async () => { throw new Error('should not be called') }, describeAction)
    expect(result.remaining).toEqual(actions)
    expect(result.resolvedMessages).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- drainQueue`
Expected: FAIL with a module-not-found error (`app/utils/drainQueue.ts` doesn't exist yet).

- [ ] **Step 3: Implement the drain orchestration module**

Create `app/utils/drainQueue.ts`:

```ts
import type { PendingAction } from './offlineQueue'
import { isNetworkFailure } from './offlineQueue'

export interface DrainOutcome {
  remaining: PendingAction[]
  resolvedMessages: string[]
  failedMessages: string[]
  stoppedEarly: boolean
}

// Replays a queue of actions in order. A network failure (the PC dropped
// mid-drain) stops the whole pass — everything from that point on is left
// queued for the next reachable check. A real HTTP error from a still-
// reachable server only parks that one action as `failed` and keeps
// draining the rest, since it says nothing about whether the others will
// also fail. Already-`failed` actions are left untouched — they're not
// auto-retried, only a manual retry or discard changes them. The actual
// network call is injected (`replay`) so this stays testable without a
// server.
export async function drainActions(
  actions: PendingAction[],
  replay: (action: PendingAction) => Promise<void>,
  describeAction: (action: PendingAction) => string
): Promise<DrainOutcome> {
  const remaining: PendingAction[] = []
  const resolvedMessages: string[] = []
  const failedMessages: string[] = []
  let stoppedEarly = false

  for (const action of actions) {
    if (stoppedEarly || action.status === 'failed') {
      remaining.push(action)
      continue
    }
    try {
      await replay(action)
      resolvedMessages.push(`Synced: ${describeAction(action)}`)
    } catch (err) {
      if (isNetworkFailure(err)) {
        remaining.push(action)
        stoppedEarly = true
      } else {
        remaining.push({ ...action, status: 'failed' })
        failedMessages.push(`Failed to sync: ${describeAction(action)}`)
      }
    }
  }

  return { remaining, resolvedMessages, failedMessages, stoppedEarly }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- drainQueue`
Expected: PASS (all four tests).

- [ ] **Step 5: Wire the module into `useTodos.ts`**

In `app/composables/useTodos.ts`, add the import:

```ts
import { drainActions } from '../utils/drainQueue'
```

Inside `useTodos()`, add (after `pendingIds`):

```ts
  const syncStatus = useState<'idle' | 'syncing'>('todos-sync-status', () => 'idle')
  const syncReport = useState<{ message: string, at: string }[]>('todos-sync-report', () => [])
  const failedCount = computed(() => pendingActions.value.filter(a => a.status === 'failed').length)

  function logSyncReport(message: string) {
    syncReport.value = [{ message, at: new Date().toISOString() }, ...syncReport.value].slice(0, 10)
  }

  async function replayAction(action: PendingAction): Promise<void> {
    switch (action.type) {
      case 'create':
        await $fetch(`/api/todos`, { method: 'POST', body: { id: action.tempId, title: action.title, category: action.category } })
        return
      case 'patch':
        await $fetch(`/api/todos/${action.id}`, { method: 'PATCH', body: { title: action.title, category: action.category } })
        return
      case 'complete':
      case 'reopen':
        await $fetch(`/api/todos/${action.id}`, { method: 'PATCH', body: { action: action.type } })
        return
      case 'delete':
        await $fetch(`/api/todos/${action.id}`, { method: 'DELETE' })
        return
    }
  }

  function describeAction(action: PendingAction): string {
    const target = action.type === 'create' ? action.title : action.id
    return `${action.type} (${target})`
  }

  async function drainQueue() {
    if (syncStatus.value === 'syncing') return
    const drainable = pendingActions.value.filter(a => a.status !== 'failed')
    if (drainable.length === 0) return

    syncStatus.value = 'syncing'
    const { remaining, resolvedMessages, failedMessages, stoppedEarly } = await drainActions(
      pendingActions.value,
      replayAction,
      describeAction
    )
    for (const message of resolvedMessages) logSyncReport(message)
    for (const message of failedMessages) logSyncReport(message)

    pendingActions.value = remaining
    persistQueue()
    syncStatus.value = 'idle'
    if (!stoppedEarly) {
      await refresh()
    }
  }

  async function checkReachableAndDrain() {
    try {
      await $fetch('/api/todos', { method: 'GET' })
    } catch (err) {
      if (!isNetworkFailure(err)) throw err
      // PC unreachable — nothing to do until the next poll tick.
      return
    }
    // drainQueue() already calls refresh() itself once it has actually
    // drained something; only do it here for the "queue was already empty"
    // case, where drainQueue() no-ops and skips that internal refresh —
    // otherwise a successful drain would trigger two refreshes back to back.
    const hadWork = pendingActions.value.some(a => a.status !== 'failed')
    await drainQueue()
    if (!hadWork) {
      await refresh()
    }
  }

  async function forceSync() {
    await checkReachableAndDrain()
  }
```

- [ ] **Step 6: Fold the reachability check into the existing poll loop**

Replace `startPolling`:

```ts
  function startPolling() {
    if (pollHandle || !import.meta.client) return
    pollHandle = setInterval(() => {
      refresh().catch((err) => {
        if (isNetworkFailure(err)) {
          checkReachableAndDrain().catch(() => {})
        } else {
          console.error('[ledger] poll refresh failed', err)
        }
      })
    }, 15000)
  }
```

- [ ] **Step 7: Return the new fields**

Add to the returned object from Task 7:

```ts
    syncStatus,
    syncReport,
    failedCount,
    forceSync,
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — every test from Tasks 1–6 plus the four new `drainQueue` tests from Step 4, no regressions. `useTodos.ts`'s own wiring around `drainActions` (the `$fetch` calls in `replayAction`, the poll loop) has no dedicated test of its own — it's thin glue over the now-tested `drainActions`, `$fetch`, and `useState`, verified live in Task 12, consistent with the rest of this composable.

- [ ] **Step 9: Commit**

```bash
git add app/composables/useTodos.ts app/utils/drainQueue.ts test/utils/drainQueue.test.ts
git commit -m "feat: drain the offline queue on reachability, add forceSync"
```

---

### Task 9: Pending-change UI — row badge and header status

**Files:**
- Modify: `app/components/TaskRow.vue`
- Create: `app/components/SyncStatus.vue`
- Modify: `app/pages/index.vue`

**Interfaces:**
- Consumes: `pendingIds`, `syncStatus`, `syncReport`, `failedCount`, `forceSync` from Task 7/8's `useTodos()`.
- Produces: `computeSyncStatusLabel(input: { pendingCount: number, failedCount: number, syncing: boolean }): string` from `app/utils/syncStatusLabel.ts` — the label-priority branching (syncing > failed > pending > all-synced), kept out of the `.vue` file so it's unit-testable without mounting a component.

- [ ] **Step 1: Add a `pending` prop and badge to `TaskRow.vue`**

In `app/components/TaskRow.vue`, add to `defineProps`:

```ts
const props = defineProps<{
  todo: Todo
  lastSyncedAt: number
  pending: boolean
}>()
```

Add a badge into the template, right after the closing `</div>` of `task-row__body` (still inside the root `.task-row` div):

```html
    <span
      v-if="pending"
      class="task-row__pending-badge"
      role="img"
      aria-label="Not yet synced to your PC"
      title="Not yet synced to your PC"
    >
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--color-caption)" stroke-width="1.4" />
        <path d="M10 6v4l3 2" fill="none" stroke="var(--color-caption)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
```

Add to the `<style scoped>` block:

```css
.task-row__pending-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}
```

- [ ] **Step 2: Pass `pending` down from `index.vue`**

In `app/pages/index.vue`, destructure `pendingIds` from `useTodos()` (alongside the fields from Task 7) and pass it to `TaskRow`:

```ts
const {
  todos,
  lastSyncedAt,
  refresh,
  createTodo,
  editTodo,
  completeTodo,
  removeTodo,
  startPolling,
  stopPolling,
  pendingIds,
  syncStatus,
  syncReport,
  failedCount,
  forceSync,
} = useTodos()
```

```html
            <TaskRow
              :todo="todo"
              :last-synced-at="lastSyncedAt"
              :pending="pendingIds.has(todo.id)"
              @complete="handleComplete"
              @inspect="inspectTodo"
              @open="goToDispatch"
              @edit="openEdit"
              @remove="handleRemove"
            />
```

- [ ] **Step 3: Write the failing unit tests for the status-label logic**

Create `test/utils/syncStatusLabel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeSyncStatusLabel } from '../../app/utils/syncStatusLabel'

describe('computeSyncStatusLabel', () => {
  it('shows "Syncing…" while a sync is in progress, regardless of counts', () => {
    expect(computeSyncStatusLabel({ pendingCount: 3, failedCount: 1, syncing: true })).toBe('Syncing…')
  })

  it('prioritizes failed count over pending count', () => {
    expect(computeSyncStatusLabel({ pendingCount: 2, failedCount: 1, syncing: false })).toBe("1 change couldn't sync")
  })

  it('pluralizes failed count', () => {
    expect(computeSyncStatusLabel({ pendingCount: 0, failedCount: 2, syncing: false })).toBe("2 changes couldn't sync")
  })

  it('shows pending count when nothing has failed', () => {
    expect(computeSyncStatusLabel({ pendingCount: 1, failedCount: 0, syncing: false })).toBe('1 change pending')
  })

  it('pluralizes pending count', () => {
    expect(computeSyncStatusLabel({ pendingCount: 3, failedCount: 0, syncing: false })).toBe('3 changes pending')
  })

  it('shows "All synced" when idle with nothing pending or failed', () => {
    expect(computeSyncStatusLabel({ pendingCount: 0, failedCount: 0, syncing: false })).toBe('All synced')
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npm test -- syncStatusLabel`
Expected: FAIL with a module-not-found error.

- [ ] **Step 5: Implement the status-label module**

Create `app/utils/syncStatusLabel.ts`:

```ts
export interface SyncStatusInput {
  pendingCount: number
  failedCount: number
  syncing: boolean
}

export function computeSyncStatusLabel(input: SyncStatusInput): string {
  if (input.syncing) return 'Syncing…'
  if (input.failedCount > 0) return `${input.failedCount} change${input.failedCount === 1 ? '' : 's'} couldn't sync`
  if (input.pendingCount > 0) return `${input.pendingCount} change${input.pendingCount === 1 ? '' : 's'} pending`
  return 'All synced'
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- syncStatusLabel`
Expected: PASS (all six tests).

- [ ] **Step 7: Create the header status indicator**

Create `app/components/SyncStatus.vue`:

```vue
<script setup lang="ts">
import { computeSyncStatusLabel } from '../utils/syncStatusLabel'

const props = defineProps<{
  pendingCount: number
  failedCount: number
  syncing: boolean
}>()

const emit = defineEmits<{ sync: [] }>()

const label = computed(() => computeSyncStatusLabel(props))

const isIdle = computed(() => !props.syncing && props.pendingCount === 0 && props.failedCount === 0)
</script>

<template>
  <button
    type="button"
    class="sync-status"
    :class="{ 'sync-status--attention': failedCount > 0 }"
    :aria-label="`${label}. Tap to sync now.`"
    :disabled="isIdle && !syncing"
    @click="emit('sync')"
  >
    {{ label }}
  </button>
</template>

<style scoped>
.sync-status {
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 11px;
  color: var(--color-caption);
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.sync-status:disabled {
  cursor: default;
}

.sync-status:not(:disabled):hover {
  background: var(--color-bg-base);
}

.sync-status--attention {
  color: var(--color-accent-text);
}
</style>
```

- [ ] **Step 8: Wire it into `index.vue`**

Add right after `<LedgerHeader />`:

```html
    <SyncStatus
      :pending-count="pendingActions.filter((a) => a.status === 'pending').length"
      :failed-count="failedCount"
      :syncing="syncStatus === 'syncing'"
      @sync="forceSync"
    />
```

(This reads `pendingActions` directly, so also destructure it from `useTodos()` in the `<script setup>` block alongside the fields added in Step 2.)

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS — every test from Tasks 1–8 plus the six new `syncStatusLabel` tests from Step 6, no regressions.

- [ ] **Step 10: Live check**

Run `npm run dev`, open the app, and confirm the "All synced" indicator renders in the header and no console errors appear. (Provoking an actual pending/failed state requires the reachability/drain wiring exercised more fully in Task 12's end-to-end pass — this step just confirms the component renders correctly in the idle case.)

- [ ] **Step 11: Commit**

```bash
git add app/components/TaskRow.vue app/components/SyncStatus.vue app/utils/syncStatusLabel.ts test/utils/syncStatusLabel.test.ts app/pages/index.vue
git commit -m "feat: show a pending-sync badge on rows and a header sync status"
```

---

### Task 10: PWA shell — manifest, service worker, offline app-shell

**Files:**
- Modify: `nuxt.config.ts`
- Create: `service-worker/sw.ts`

**Interfaces:**
- Produces: an installable PWA (manifest + registered service worker) that precaches the app shell so the installed app opens with zero connectivity. Background Sync registration is added on top of this in Task 11.

This task is declarative config plus inherently browser-platform behavior (manifest fields, `injectManifest` precaching, service worker registration/activation) — there's no branching logic here to extract into a pure, unit-testable function the way Tasks 8/9/11 have one. It stays live-verified only (Steps 5–6 below), consistent with the test-coverage decision for this plan.

- [ ] **Step 1: Install PWA dependencies**

```bash
npm install -D @vite-pwa/nuxt workbox-precaching
```

- [ ] **Step 2: Add the custom service worker source**

Create `service-worker/sw.ts`:

```ts
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

// Injected at build time by @vite-pwa/nuxt with the actual list of built
// assets — this is what lets the installed app open with zero
// connectivity instead of needing the PC's server to render anything.
precacheAndRoute(self.__WB_MANIFEST)

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())
```

(The Background Sync `sync` event listener is added in Task 11, once there's a client-side consumer for the message it sends.)

- [ ] **Step 3: Configure `@vite-pwa/nuxt` and the offline-capable route**

In `nuxt.config.ts`, add the module and its config, and switch the ledger route to client rendering:

```ts
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/tokens.css'],
  modules: ['@vite-pwa/nuxt'],
  // The installed app must open from the service worker's cache with zero
  // connectivity, so it can't rely on a fresh server render — see
  // docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md.
  routeRules: {
    '/': { ssr: false }
  },
  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    devOptions: { enabled: true, type: 'module' },
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,svg,png,ico}']
    },
    manifest: {
      name: 'Backlog Saga',
      short_name: 'Backlog Saga',
      description: 'A fantasy-themed todo ledger',
      start_url: '/',
      display: 'standalone',
      background_color: '#f5efe3',
      theme_color: '#1b2a4a',
      icons: [
        { src: '/favicon.png', sizes: '72x72', type: 'image/png' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
      ]
    }
  },
  runtimeConfig: {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    codexDir: process.env.CODEX_DIR ? resolve(rootDir, process.env.CODEX_DIR) : ''
  },
  nitro: {
    experimental: { tasks: true },
    scheduledTasks: {
      '* * * * *': ['guild:resolve']
    },
    storage: {
      data: { driver: 'fs', base: process.env.DATA_DIR ? resolve(rootDir, process.env.DATA_DIR) : './.data/db' }
    }
  }
})
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions — the e2e tests use `$fetch` against API routes, unaffected by SPA rendering on `/`).

- [ ] **Step 5: Live check — dev server starts clean and the manifest/service worker are served**

Run `npm run dev`, then in a separate terminal:

```bash
curl -s http://localhost:3000/manifest.webmanifest | head -c 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/sw.js
```

Expected: the manifest curl prints JSON starting with `{"name":"Backlog Saga"`, and the `sw.js` request returns `200`.

- [ ] **Step 6: Live check — install prompt and offline reload, in an actual browser**

With the dev server still running, open `http://localhost:3000` in Chrome, open DevTools → Application → Service Workers, and confirm a service worker is registered and activated. Then, in DevTools → Network, switch to "Offline" and reload the page — the ledger shell should still render (backed by the cached local todo mirror from Task 5/7), not a browser error page.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json nuxt.config.ts service-worker/sw.ts
git commit -m "feat: add PWA manifest and service worker for offline installability"
```

---

### Task 11: Background Sync registration

**Files:**
- Modify: `service-worker/sw.ts`
- Modify: `app/composables/useTodos.ts`

**Interfaces:**
- Consumes: `drainQueue`/`checkReachableAndDrain` from Task 8.
- Produces: `shouldAttemptBackgroundSync(connection: { type?: string } | undefined): boolean` from `app/utils/backgroundSync.ts` — the cellular-skip rule, kept as a pure predicate so it's unit-testable without a real `navigator.connection`. Also produces a `SYNC_TAG = 'offline-queue-drain'` constant registered whenever an action is queued, and a service worker `sync` event listener that asks any open tab to drain when the browser decides connectivity is back.

- [ ] **Step 1: Write the failing unit test for the cellular-skip predicate**

Create `test/utils/backgroundSync.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { shouldAttemptBackgroundSync } from '../../app/utils/backgroundSync'

describe('shouldAttemptBackgroundSync', () => {
  it('skips when the connection type is cellular', () => {
    expect(shouldAttemptBackgroundSync({ type: 'cellular' })).toBe(false)
  })

  it('attempts on wifi', () => {
    expect(shouldAttemptBackgroundSync({ type: 'wifi' })).toBe(true)
  })

  it('attempts when connection info is unavailable', () => {
    expect(shouldAttemptBackgroundSync(undefined)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- backgroundSync`
Expected: FAIL with a module-not-found error.

- [ ] **Step 3: Implement the predicate**

Create `app/utils/backgroundSync.ts`:

```ts
// A background sync firing off the home LAN is known to fail (the PC is
// only reachable from home Wi-Fi — see
// docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md), so skip
// attempting it on cellular rather than spending battery/data on a doomed
// request. `navigator.connection` isn't universally supported, so a
// missing/undefined connection defaults to attempting — the request will
// just fail harmlessly if it's actually unreachable.
export function shouldAttemptBackgroundSync(connection: { type?: string } | undefined): boolean {
  return connection?.type !== 'cellular'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- backgroundSync`
Expected: PASS (all three tests).

- [ ] **Step 5: Add the `sync` event listener to the service worker**

In `service-worker/sw.ts`, add below the existing `activate` listener:

```ts
const SYNC_TAG = 'offline-queue-drain'

self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent
  if (syncEvent.tag !== SYNC_TAG) return
  syncEvent.waitUntil(
    self.clients.matchAll().then((clients) => {
      for (const client of clients) {
        client.postMessage({ type: 'background-sync-drain' })
      }
    })
  )
})
```

(`SyncEvent` isn't in the default `webworker` lib types; if TypeScript complains, add `declare interface SyncEvent extends ExtendableEvent { tag: string }` near the top of the file, below the `ServiceWorkerGlobalScope` declaration.)

- [ ] **Step 6: Register a sync on every queued action, and listen for the drain message on the client**

In `app/composables/useTodos.ts`, add the import:

```ts
import { shouldAttemptBackgroundSync } from '../utils/backgroundSync'
```

Add a helper and call it from `queueAndApplyOptimistically`:

```ts
  const SYNC_TAG = 'offline-queue-drain'

  async function registerBackgroundSync() {
    if (!import.meta.client) return
    const connection = (navigator as { connection?: { type?: string } }).connection
    if (!shouldAttemptBackgroundSync(connection)) return
    if (!('serviceWorker' in navigator)) return
    try {
      const registration = await navigator.serviceWorker.ready
      if ('sync' in registration) {
        await (registration as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register(SYNC_TAG)
      }
    } catch {
      // Background Sync isn't supported/available — the foreground poll
      // from Task 8 is still the primary mechanism, so this is a no-op.
    }
  }
```

Update `queueAndApplyOptimistically` to call it:

```ts
  function queueAndApplyOptimistically(action: PendingAction) {
    pendingActions.value = enqueueAction(pendingActions.value, action)
    todos.value = applyActionOptimistically(todos.value, action)
    persistQueue()
    persistCache()
    registerBackgroundSync().catch(() => {})
  }
```

Add a one-time client-side listener for the service worker's drain message. Add near the top of `useTodos()`, guarded so it's only attached once:

```ts
  if (import.meta.client && !messageListenerAttached) {
    messageListenerAttached = true
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data?.type === 'background-sync-drain') {
        checkReachableAndDrain().catch(() => {})
      }
    })
  }
```

Add the module-scoped guard flag alongside `pollHandle` at the top of the file:

```ts
let pollHandle: ReturnType<typeof setInterval> | undefined
let messageListenerAttached = false
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — every test from Tasks 1–9 plus the three new `backgroundSync` tests from Step 4, no regressions.

- [ ] **Step 8: Live check**

Run `npm run dev`, open the app in Chrome with DevTools → Application → Service Workers open, go offline (Network tab), add a todo (it should queue and show the pending badge), confirm in the Service Workers panel that a "Sync" registration appears (Chrome surfaces pending Background Sync registrations there), then go back online and confirm the queue drains (badge disappears, "All synced" shows).

- [ ] **Step 9: Commit**

```bash
git add service-worker/sw.ts app/composables/useTodos.ts app/utils/backgroundSync.ts test/utils/backgroundSync.test.ts
git commit -m "feat: register Background Sync so the queue can drain outside the foreground poll"
```

---

### Task 12: End-to-end verification and docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Full automated suite**

Run: `npm test`
Expected: PASS, every test from Tasks 1–11.

- [ ] **Step 2: Live pass — full offline CRUD cycle on desktop Chrome**

With `npm run dev` running: open the app, go offline (DevTools → Network → Offline), then:
- Create a todo — appears immediately with the pending badge.
- Edit its title — updates immediately, still pending.
- Complete it — checkbox flips, still pending.
- Reopen it — flips back, still pending.
- Delete a different (pre-existing, already-synced) todo — disappears immediately, still pending.
- Go back online — confirm the header status moves to "Syncing…" then "All synced," the pending badges clear, and `GET /api/todos` (via curl or a second tab) shows the PC's data matching what the phone view now shows.

- [ ] **Step 3: Live pass — install and real offline cold-start on an Android phone**

On an Android phone connected to the same Wi-Fi as the dev machine: open `http://<PC-LAN-IP>:3000` in Chrome, use "Add to Home screen," open the installed app, turn on Airplane Mode, and confirm the app still opens (service worker precache) and still shows the last-known todo list (local cache). Add/edit/complete a todo while in Airplane Mode, confirm the pending badge appears, turn Wi-Fi back on, and confirm it syncs (matching the PC's data) without reopening the app.

- [ ] **Step 4: Clean up any test data created during the live passes**

Delete any todos created solely for verification, on both the phone and PC views, and confirm `GET /api/todos` reflects a clean list.

- [ ] **Step 5: Document it**

Add a section to `README.md`, after the existing "Run it" section:

```markdown
## Offline / installing as an app

The ledger page can be installed as a PWA on Android (Chrome menu → "Add
to Home screen" / "Install app") and works fully offline once installed —
adding, editing, completing, reopening, and deleting todos all work with
no connection. Changes made offline are queued locally and sync back to
this PC automatically the next time the phone is on the same Wi-Fi network
as it — reachability is Wi-Fi-only by design (see
`docs/superpowers/specs/2026-08-07-offline-pwa-sync-design.md`), so it
won't sync over cellular or from outside the home network.

A small header indicator shows pending/failed sync state; tap it to force
an immediate sync attempt instead of waiting for the next automatic check.
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document offline/PWA usage"
```

---

## Self-Review Notes

- **Spec coverage:** local cache (Task 5), pending queue + collapsing rule (Task 6), client-generated ids + idempotent create (Task 4), offline-aware dispatch for all five mutation types incl. the previously-inline edit path (Task 7), reachability polling + drain + forceSync + sync report (Task 8), non-checkbox pending badge + status indicator (Task 9), idempotent PATCH/DELETE (Tasks 2–3), PWA shell/installability (Task 10), Background Sync with cellular skip (Task 11), testing + manual device pass + docs (Task 12). All design-doc sections are covered.
- **Type consistency checked:** `PendingAction`'s `status: 'pending' | 'failed'` field (introduced in Task 6) is used consistently by Task 8's `drainActions`/`drainQueue` and Task 9's `SyncStatus` props. `editTodo`'s signature in Task 7 matches its call site in Task 7 Step 8. `TodoNotFound`/`isTodoNotFound` from Task 2 are used with matching shapes in Task 7's `completeTodo`/`reopenTodo`/`editTodo`. `drainActions`'s `DrainOutcome` shape (Task 8) is consumed identically by `drainQueue`'s destructuring in the same task.
- **No placeholders:** every step has concrete, complete code — nothing marked TBD or "similar to above."
- **Test-coverage policy applied consistently:** after the pre-flight scan (see Global Constraints), Tasks 2, 8, 9, and 11 were each revised to extract their branching logic into a unit-tested `app/utils/` module (`isTodoNotFound` alongside Task 2's existing e2e test, `drainActions`, `computeSyncStatusLabel`, `shouldAttemptBackgroundSync`); Task 10 was left live-verified-only with an explicit note explaining why (no pure logic exists to extract there).

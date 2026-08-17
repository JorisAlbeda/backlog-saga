# Todo Retention (Auto-Cleanup of Old Done Todos) — Design

## Problem

The Ledger never removes anything. Every completed-and-chronicled todo
stays in the category-grouped list forever, so the list keeps growing and
clogging each faction's section with tasks the user has no further use for
seeing day to day.

## Key existing fact this design leans on

A todo's narrative content is already permanently duplicated elsewhere by
the time it reaches `Done`: `getTaskState` reports `'done'` only once
`completedAt` is set **and** `guildStatus === 'chronicled'`, and in
`guild.ts`, `guildStatus: 'chronicled'` and `chronicleWritten: true` are
always written together, atomically, only after the `ChronicleEntry` write
has actually succeeded. So a `Done` todo can be removed from the active
Ledger without losing anything — the Chronicle already has the permanent
record.

## Scope

- Targets **only** `Done` todos (completed + chronicled). `To Do` and
  `Taking Shape` todos are never touched, regardless of age.
- Time-based retention, not count-based: a `Done` todo is removed once more
  than `TODO_RETENTION_DAYS` days have elapsed since its `completedAt`.
- Real deletion from `todos.json`, not a view-only filter — the goal is to
  bound the store's growth, not just hide old rows in the UI.

## Approaches considered

1. **Hard delete via a new daily scheduled task (chosen).** A dedicated
   `todos:cleanup` task sweeps and deletes qualifying `Done` todos once a
   day, independent of the per-minute `guild:resolve` task.
2. **Soft filter (view-only).** Hide old `Done` rows from the Ledger/API
   without deleting them. Rejected: `todos.json` would keep growing
   unbounded, which doesn't solve the stated problem — it only hides it.
3. **Count-based cap per category instead of time.** Rejected in favor of
   time-based during brainstorming.

## Design

### Config

`runtimeConfig.todoRetentionDays` in `nuxt.config.ts`, following the same
pattern as `codexDir`/`ollamaBaseUrl`:

```ts
todoRetentionDays: process.env.TODO_RETENTION_DAYS
  ? Number(process.env.TODO_RETENTION_DAYS)
  : 7
```

- **Unset** → default of **7 days**.
- **Explicitly `0`** → cleanup is disabled entirely (the daily task runs,
  logs that it's disabled, and deletes nothing). Unset and `0` are
  deliberately different values — unset does not mean disabled.

### Server

- `deleteOldDoneTodos(retentionDays: number): Promise<number>` in
  `server/utils/store.ts`, run through the existing `withLock` queue like
  every other mutation there. Selects todos where:
  - `getTaskState(todo) === 'done'`
  - `todo.chronicleWritten === true` (defensive, redundant with the above,
    but a deliberate second guard against ever deleting a todo whose
    chronicle write didn't actually land)
  - `Date.now() - new Date(todo.completedAt).getTime() > retentionDays * 86_400_000`

  Returns the number removed. A `retentionDays` of `0` short-circuits to a
  no-op before touching storage.

- `server/tasks/todos/cleanup.ts`, mirroring the shape of
  `server/tasks/guild/resolve.ts`: calls `deleteOldDoneTodos`, never throws
  out of the task, logs
  `[todos:cleanup] removed N todos older than Dd` (or
  `[todos:cleanup] disabled (TODO_RETENTION_DAYS=0)` when disabled).

- New `nitro.scheduledTasks` entry, daily rather than per-minute:
  ```ts
  scheduledTasks: {
    '* * * * *': ['guild:resolve'],
    '0 3 * * *': ['todos:cleanup']
  }
  ```

### Client

No changes. `useTodos()`'s `refresh()` already takes the server's `Todo[]`
as its base and reapplies the pending-action queue on top — a todo the
server stops returning simply disappears from local state on the next
poll, with no special-case code needed.

**Offline interaction**: if a client queues a mutation against a `Done`
todo that gets cleaned up server-side before that client reconnects, replay
hits the same "target not found" path every idempotent mutation endpoint
already handles from the offline-pwa-sync work — discarded, not an error.
This is an existing mechanism absorbing a new cause, not new work.

### Out of scope

- No UI indicator of pending/upcoming deletion.
- No manual "archive now" affordance.
- No per-category retention override.

## Testing

- Unit test for the retention-selection logic (pure function, easy to
  isolate from `withLock`/storage): given a fixed "now" and a mix of
  `todo`/`taking-shape`/`done` todos at various `completedAt` ages,
  confirms only qualifying `Done` todos are selected — including the
  `chronicleWritten` guard and the boundary at exactly `retentionDays`.
- e2e test for `deleteOldDoneTodos` against isolated storage (same
  `DATA_DIR`-isolation pattern as the existing `test/server/*.e2e.test.ts`
  suite): seed a mix of old/new, done/not-done todos, run the sweep, assert
  the right ones survive.
- No test needed for the scheduled-task wiring itself, consistent with how
  `guild:resolve`'s cron registration isn't separately tested.

# Offline PWA Sync — Design

## Problem

Backlog Saga currently only runs as a server-rendered app served by the PC's
Nitro server. To add a todo, the PC has to be on and running the dev/prod
server. The user wants to jot todos down from their phone at any time
(e.g. away from the PC, PC off) and have them show up on the PC — and the
PC's already-running guild-resolution job — once both are back in range of
each other, without needing to boot the PC just to write something down.

## Constraints (from discussion)

- **Reachability**: home Wi-Fi only. The phone syncs with the PC only when
  both are on the same LAN; no VPN/mesh network, no public exposure of the
  PC's server. This keeps the design private and simple, at the cost of
  syncing only being possible from home.
- **Offline scope**: full CRUD offline — add, edit, complete, reopen, and
  delete todos with no connection to the PC, not just queuing new todos.
- **Platform**: Android. Chrome's Background Sync API is available, so sync
  isn't strictly limited to "app must be open" the way it would be on iOS —
  but it also isn't guaranteed to fire, so it's a bonus layer, not the
  primary mechanism.
- **Sync trigger**: automatic-attempt with a visible status, not a
  manual-only "Sync Now" button (though a manual force-sync affordance is
  still part of the design, as a way to force/confirm the automatic path).
- **Data cost**: don't attempt a background sync on cellular when it's
  known to fail anyway (the PC is never reachable off the home LAN) — avoid
  needlessly burning battery/data on a doomed request.

## Architecture: local-first with a queued-actions sync

The core idea: the phone keeps a **local cache** of the todo list plus a
**pending-actions queue**, and every mutation goes through one dispatch
path — try it against the PC immediately if reachable, otherwise apply it
optimistically to the local cache and queue it for later.

This works cleanly with the *existing* API because it already speaks in
terms of user actions computed against live server state, not client-sent
snapshots: `PATCH /api/todos/:id` takes `{ title?, category?, action? }` and
`updateTodo` recomputes the patch against whatever the server's current
state is, not a value the client read earlier. The guild-owned fields
(`guildStatus`, `subtype`, `text.drafted`/`text.chronicled`, `resultName`,
`resultDetail`, `chronicleWritten`, `codexEntryWritten`) are *only* ever
written by the server-side guild resolution job — the phone never touches
them, online or offline. So there's no real two-way merge to design: the
only thing that can actually collide is the same todo being mutated from
both devices before either syncs, which for a single-user app is rare
enough that **replaying queued actions in server-arrival order** — i.e.
whichever action reaches the server last wins, exactly as if it had been
tapped live — is an honest, sufficient rule. No timestamps, no clock-skew
risk, because ordering is just "queue order," not wall-clock comparison.

### Data model & storage

- **Local cache**: the full `Todo[]` list, mirrored to `localStorage`.
  `localStorage` (not IndexedDB) is enough at this scale — a personal list
  of at most dozens of items — and keeps the mutation code synchronous,
  matching the existing reactive `useState<Todo[]>` model rather than
  introducing an async storage layer.
- **Pending-actions queue**: an ordered array, also in `localStorage`, using
  shapes that mirror the existing request bodies:
  ```ts
  type PendingAction =
    | { type: 'create', tempId: string, title: string, category: Category }
    | { type: 'patch', id: string, title?: string, category?: Category }
    | { type: 'complete' | 'reopen', id: string }
    | { type: 'delete', id: string }
  ```
- **Client-generated IDs**: today the server mints a todo's `id` on create.
  Offline creates need a real, stable id immediately, so later queued
  actions in the same offline session (e.g. complete a todo you just
  created offline) can reference it. The phone generates the id itself
  (`crypto.randomUUID()`) and sends it with the create request; the server
  accepts a client-supplied id when present, otherwise generates its own as
  it does today (online creates from the PC are unaffected).
- **Queue collapsing**: creating and then deleting the same not-yet-synced
  todo drops both queue entries together — no round trip needed for a
  todo that never needs to exist server-side.
- **Optimistic UI + pending indicator**: while an action is queued but
  unconfirmed, the local cache reflects the intended result immediately
  (e.g. checkbox shows completed). The row also carries a small **icon
  badge** (not a checkbox variant — that channel is already used by the
  taking-shape state — and not color alone, for accessibility) with an
  `aria-label`/tooltip such as "Not yet synced to your PC," so it can
  appear independently of whatever guild-progress state the row is in.

### Sync & reachability

- **Reachability** means "can I reach the PC's server," not just "does the
  phone have internet" — `navigator.onLine` alone isn't sufficient. A
  lightweight health-check request determines this — and needs no separate
  address configuration: the installed PWA's own origin *is* the PC's
  address (whatever URL you installed it from, e.g. `http://192.168.1.50:
  3000`), so the health check and every queued action are just relative-path
  fetches (`/api/todos`, ...) against that origin. Off the home LAN, or with
  the PC off, those fetches fail with a network error — that failure itself
  is the "not reachable" signal, nothing extra to track.
- **Foreground polling**: while the app is open/in memory, a short-interval
  health check (same rhythm as the existing 15s refresh poll) drives
  automatic sync attempts. This only runs while the app is foregrounded —
  if Android suspends/evicts the backgrounded tab, this poll stops, which
  is the gap Background Sync covers.
- **On reachable**: drain the pending-actions queue in order against the
  real `/api/todos` endpoints — the same calls already made when online
  today. A failure partway through just stops the drain; the remainder
  stays queued for the next reachable check (see error handling below for
  what "failure" means precisely).
- **After a drain**: a normal `refresh()` pulls the merged, authoritative
  state back down, same as today.
- **Background Sync API (Android bonus)**: register a sync event tagged to
  the queue so the browser can attempt a drain even when the app isn't
  open, on its own schedule/heuristics. This is a bonus on top of the
  foreground check, never a replacement — Chrome doesn't guarantee it
  fires, or when. Before attempting, check `navigator.connection.type`
  (where supported) and skip the attempt entirely on cellular, since it's
  known to fail off the home LAN — avoids burning battery/data on a doomed
  request. (Where `navigator.connection` isn't supported, just attempt as
  normal; the health check still fails harmlessly.)
- **Status UI**: a small persistent indicator (e.g. in the header) showing
  pending-change count / "All synced" / "Syncing…", tappable to force an
  immediate reachability check + drain.

### Idempotent mutation endpoints

To make the queue-drain rule simple and to fix a real existing rough edge
(two browser tabs / PC+phone both online, one deletes a todo the other
still shows), the mutation endpoints become idempotent rather than
error-on-missing:

- `DELETE` on an already-gone id: `200`, since the desired end state ("this
  todo doesn't exist") is already true.
- `PATCH`/complete/reopen on an already-gone id: `200`, with a body that
  distinguishes itself from a real `Todo` — e.g. `{ id, status:
  'not-found' }` — since there's no todo object to return.

This means the queue processor's rule collapses to one line: **any 2xx
response (including the not-found marker) resolves the action and gets
logged to the sync report; any non-2xx is a real failure and stays parked,
marked failed, for the user to review.** No 404-specific special-casing —
the status code directly means what the queue needs it to mean, and
nothing is ever silently dropped: it's either auto-resolved *with a logged
reason* (target was deleted), or it's visibly stuck pending the user's
decision (retry/discard).

### PWA shell (installability + offline cold-start)

Distinct from the sync logic above: making the app actually launchable with
zero connectivity at all requires standard PWA infrastructure that doesn't
exist yet:

- **Service worker** (via `@vite-pwa/nuxt`) precaching the built JS/CSS/HTML
  app shell, so opening the installed app works from cache regardless of
  PC reachability.
- **Client-rendered (SPA) mode for the ledger route** (`routeRules: { '/':
  { ssr: false } }`), since a precached shell can't be freshly
  server-rendered — it hydrates from cache and talks to the local
  cache/queue layer described above. Other routes (e.g. `/dispatch/[id]`)
  are unaffected.
- **Web app manifest** (name, icons, `display: standalone`) so Android
  offers "Install app" and it opens without browser chrome.

## Error handling & edge cases

- **Non-2xx queue action**: parked in the queue, marked `failed` (distinct
  from `pending`), surfaced via the status indicator ("1 change couldn't
  sync — tap to review") for the user to retry or discard. The drain does
  not silently retry-forever or silently drop these.
- **2xx "not-found" resolution** (delete/patch/complete/reopen against an
  already-deleted todo): auto-resolved, but logged to a small sync report
  (e.g. "Discarded: edit to 'Fix the fence post' — that task was deleted")
  so it's visible rather than silently vanished.
- **Uncertain delivery** (request sent, response lost before confirmation):
  `create` is idempotent via the client-generated id — a retried create
  with the same id returns the existing todo rather than erroring or
  duplicating. `complete`/`reopen`/`delete` are naturally idempotent
  already.
- **Corrupt/unreadable local storage**: fail soft — reset to an empty
  cache/queue and log a warning, rather than crashing on load.
- **Cold offline open, no prior sync**: empty cache renders the existing
  empty state; no special-casing needed.

## Testing

- Unit tests for the queue logic in isolation: applying an action
  optimistically to the local cache, the create+delete collapsing rule,
  idempotent-retry handling, the "not-found" resolution path.
- An integration-style test: simulate going offline, queue a mix of
  actions, come back online, assert the server ends up in the expected
  state and the queue drains to empty (aside from any deliberately-induced
  failures, which should remain parked).
- Real-device manual pass (can't be meaningfully unit-tested): install on
  an Android phone, kill Wi-Fi, add/edit/complete/delete a few todos,
  restore Wi-Fi, confirm sync completes and PC-side data matches.

## Out of scope (for this design)

- Reachability from outside the home network (VPN/mesh, public exposure).
- The PC's LAN IP changing (e.g. DHCP reassigning it): since the PWA's
  installed origin *is* the address used for every sync attempt, if that IP
  changes, syncing silently stops working until the app is reinstalled from
  the new address. A static DHCP reservation on the router sidesteps this
  in practice; handling it in-app (e.g. reachability probing across the
  subnet, or a discovery mechanism) is real added complexity left for a
  future iteration if it turns out to matter.
- iOS support.
- True multi-device-simultaneous-use conflict resolution beyond
  "last-action-wins by arrival order."

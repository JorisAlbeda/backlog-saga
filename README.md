# Backlog Saga — PoC

Complete a TODO → the Construction Guild builds something because of it → that
building gets written to `world-material.md` for a future Oath session, and is
browsable in-app via the Chronicle.

Built to `Backlog-Saga-Build-Brief-ClaudeCode.md` and
`Backlog-Saga-PoC-Design-Handoff.md`. This README covers what those two docs
left to build-time judgement.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000 (mobile-only design — use the browser's
device toolbar or resize to ~402px wide).

By default the app assumes Ollama is unreachable and everything still works:
completing a task reveals its placeholder text immediately, with no wait.
To connect a real Ollama instance (not installed on the machine this was
built on), copy `.env.example` to `.env` and point `OLLAMA_BASE_URL` at it —
including a LAN IP if Ollama runs on another machine on the same home
network. Model defaults to `qwen3:8b`.

**Not verified end-to-end here**: actual `categorised`/`chronicled` LLM
output, since no Ollama instance was available during this build. Everything
downstream of "Ollama responds to `/api/chat`" (JSON parsing, tier upgrades,
Chronicle writing, `world-material.md` formatting) is implemented per spec
but should get a real pass once pointed at a live model.

To force a resolution pass without waiting for the once-a-minute cron, hit
Nitro's dev task endpoint: `curl -X POST http://localhost:3000/_nitro/tasks/guild:resolve`.

## What's here

- `server/api/todos/` — CRUD + completion for todos.
- `server/api/chronicle/` — reads accumulated Guild dispatches.
- `server/utils/store.ts` — persistence via Nitro's `useStorage` (fs driver,
  `.data/db/`) — no database, PoC-sized on purpose and easy to inspect/reset
  by deleting the folder.
- `server/utils/ollama.ts` — calls Ollama's **native** `/api/chat` with
  `think: false` (not the OpenAI-compatible endpoint — see "Assumptions"
  below), `format: "json"` for reliable output from an 8B model, and strips
  any stray `<think>` block as a defensive fallback.
- `server/utils/guild.ts` — the staged-resolution orchestration: advances
  `init → categorised → chronicled`, only when Ollama is reachable, never
  throwing out of a single todo's failure.
- `server/tasks/guild/resolve.ts` — the Nitro scheduled task (`* * * * *`)
  that drives the above.
- `server/utils/worldMaterial.ts` — appends each finished building to
  `world-material.md` (created at the project root on first write).
- `shared/types.ts` — the `Todo`/`ChronicleEntry` shapes and the
  `getTaskState`/`currentGuildText` helpers, imported by both server and
  client so the three-state model (`todo` / `taking-shape` / `done`) can
  never drift between frontend and backend — it's derived, not stored.
- `app/pages/index.vue` — the Ledger (empty state, task list, add/edit
  overlay, completion overlay).
- `app/pages/dispatch/[id].vue` — full dispatch view for a Done task.
- `app/pages/chronicle.vue` — the Chronicle, with its own empty state.
- `app/components/` — `LedgerHeader`, `TaskRow`, `CheckboxGlyph`,
  `PrimaryButton`, `Fab`, `DispatchCard`, `EmptyState`,
  `CompletionOverlay`, `AddTaskOverlay`.
- `app/assets/tokens.css` — the design tokens from the handoff, plus
  concrete values for everything marked TBD there.

## Assumptions and judgement calls

**Fixed by the brief, not reinterpreted:** Nuxt/Nitro, local Ollama over a
cloud API, `qwen3:8b`, staged resolution via `scheduledTasks`, one faction
only.

**Ollama call path.** The brief asks to confirm `think: false` works via
Ollama's OpenAI-compatible endpoint before relying on it, falling back to
the native `/api/chat` otherwise. With no Ollama available on this machine
to test that live, building an untestable detect-and-fallback path isn't
good engineering — the native endpoint is documented to support
`think: false` reliably, so that's the only call path implemented. Worth a
real check once this runs against a live Ollama instance.

**Data shape.** `guildStatus: 'init' | 'categorised' | 'chronicled'` tracks
how much of the Guild's message is *prepared*, independent of whether the
task itself is done — it can advance from `init` to `categorised` while a
todo is still open. The three UI states (`To Do` / `Taking Shape` / `Done`)
are derived from `guildStatus` + `completedAt`, never stored directly, so
they can't drift out of sync.

**Open items from the handoff**, resolved rather than guessed around:

1. **No Chronicle nav entry point** → added a header link on the Ledger
   (and back to the Ledger on the Chronicle).
2. **FAB label/colour inconsistency** ("New Task" vs "New Commission", navy
   vs amber) → standardized to one FAB everywhere: navy, "New Task". Two
   FABs for the same action, with no defined trigger for switching between
   them, seemed like more inconsistency than the two-tier system it might
   have intended.
3. **Grey caption contrast** → `--color-caption: #5c5347` against
   `--color-bg-base: #f5efe3` computes to ~6.6:1, clearing WCAG AA (4.5:1)
   for small text.
4. **Unlabelled Chronicle card icon** ("tower-control") → omitted. No spec
   exists for its behaviour (delete/pin/expand are all plausible and
   mutually exclusive); guessing at a destructive-adjacent affordance
   seemed worse than leaving it out of a PoC.
5. **Row height discrepancy** (token table says Done rows are 52px, the
   States table says 72px) → followed the States table as the more
   specific, per-row source (`--row-height-done: 72px`).
6. **Completion overlay copy when Ollama is unreachable at that moment** →
   made dynamic (`currentGuildText`) instead of a fixed string, so it
   always reflects whichever tier is actually on the record rather than
   implying an upgrade that hasn't happened.
7. **Long title / long dispatch text** → 1-line clamp + ellipsis on list
   row titles; free wrap in the overlay/dispatch card; the dispatch card
   grows with its content rather than clamping to a fixed height.
8. **More than 3 tasks / 4 Chronicle entries** → plain vertical scroll on
   each list container.
9. **Button hover/active/disabled states** (undefined in the frames) → a
   subtle brightness shift on hover/active, reduced opacity + no pointer
   events when disabled.
10. **"Still resolving vs. stuck" signal** for Taking Shape rows (flagged
    in the handoff's Animation section as worth deciding, not an
    afterthought) → a subtle pulse on the amber border plus a small
    "Checked Xs ago" caption, refreshed alongside the 15s client poll that
    picks up background tier upgrades.
11. **Accessibility** — full-row tap targets (not just the checkbox
    glyph), `aria-label`s stating status in words per row
    (e.g. "*, taking shape — *"), keyboard activation via Enter/Space.

**Not in the seven Figma frames but required by the brief's "full CRUD":**
edit (rename) and delete on To Do rows, via small icon buttons that only
appear in that state — Taking Shape/Done rows are Guild-owned once
resolution has started, so they stay read-only in this build.

## Verification performed

- Full CRUD (create, edit title, delete) exercised in-browser.
- Complete → completion overlay appears with zero wait, showing the
  `init`-tier placeholder (confirmed correct since Ollama is unreachable
  here) → Ledger row becomes Taking Shape with the same text and a
  "Checked Xs ago" caption.
- `POST /_nitro/tasks/guild:resolve` triggered manually: returns
  `{ reachable: false, categorised: 0, chronicled: 0 }` and leaves stored
  todos untouched — confirms the "don't block, don't corrupt state when
  unreachable" behaviour at the source.
- Chronicle empty state, Ledger empty state, and navigation between
  Ledger ↔ Chronicle all confirmed in-browser at the 402px mobile frame.
- `world-material.md` was **not** created during this session, correctly —
  nothing has reached the `chronicled` tier without a reachable Ollama.

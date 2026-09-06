# People Search & Reachout — Frontend build plan (phases 1–10)

## Context

A recruiter console. Paste a job description → people-search providers (PDL, Apollo,
Proxycurl, Coresignal) find candidates → an AI voice agent calls them → answers land in a
filterable table.

Dense internal ops tool: 1600px monitor, 4+ hours daily use, 10k+ row result sets, 200
concurrent live calls. Optimise for information density, keyboard speed and correctness under
real data volumes. Not a marketing site.

**Scope: frontend only.** The backend is being built separately by the user. This plan never
specifies backend implementation — only the HTTP/SSE contract the frontend consumes, so the
two can be developed in parallel and meet in the middle. Until real endpoints exist, MSW in
`src/mocks/` serves every route; switching to the real backend is deleting the
`enableMocking()` call in `src/main.tsx` and pointing `VITE_API_BASE_URL` at the server.

**Stack (fixed):** Vite · React 19 · TypeScript strict · React Router v7 (data router, library
mode) · TanStack Query v5 · TanStack Table v8 · TanStack Virtual v3 · Zustand · shadcn/ui +
Tailwind v4 · react-hook-form + Zod · MSW · Vitest + Testing Library + Playwright.

---

# THE API CONTRACT

Everything the frontend expects from the backend. All responses are Zod-parsed at
`src/shared/api/client.ts` — a shape mismatch surfaces as a specific error, never a blank
table. Schemas live in `src/shared/types/domain.ts` and each feature's `schemas/`.

Base path `/api`. Auth via `Authorization: Bearer <token>`.

### Conventions

- **Errors**: non-2xx returns `{ message: string, fieldErrors?: Record<string, string[]> }`.
  The frontend retries 5xx and 429 only — never other 4xx.
- **Timeouts**: the client aborts at 30s. Provider searches that take longer must be async
  (return a job id, stream progress) rather than a slow request.
- **IDs**: opaque strings. The frontend brands them (`SearchId`, `CampaignId`, …) but never
  parses them.
- **Timestamps**: ISO 8601 UTC.
- **Money/credits**: integers in minor units. Never floats.
- **Pagination**: results endpoints take `?cursor=&limit=`; return `{ rows, total, nextCursor }`.

### Endpoints

| Method | Path | Purpose | Phase |
|---|---|---|---|
| `POST` | `/searches/parse-jd` | JD text → structured `SearchSpec` (title, skills, seniority, location, filters) | 4 |
| `POST` | `/searches` | Create a search from an edited `SearchSpec`; returns `{ searchId }` | 4 |
| `GET` | `/searches/:id/plan` | Per-provider cost estimate before spending: `{ provider, estimatedResults, estimatedCredits }[]` | 4 |
| `POST` | `/searches/:id/run` | Start the search. Returns immediately; progress via SSE | 4 |
| `GET` | `/searches/:id/results` | `CandidatePage` — see below | 5 |
| `GET` | `/searches/:id/events` | **SSE**: per-provider progress while a search runs | 5 |
| `GET` | `/candidates/:id` | Full record incl. per-field source attribution | 5 |
| `GET` | `/campaigns` | Campaign list | 6 |
| `POST` | `/campaigns` | Create from a search + selected candidate ids | 6 |
| `GET` | `/campaigns/:id` | Campaign detail + funnel counts | 6 |
| `GET` | `/campaigns/:id/answers` | Normalised answers table | 6 |
| `GET` | `/campaigns/:id/events` | **SSE**: live call status | 7 |
| `POST` | `/campaigns/:id/start` | Begin calling. **Requires a passed compliance review** | 7, 9 |
| `POST` | `/campaigns/:id/pause` | Halt dialing | 7 |
| `GET` | `/calls/:id` | Transcript, recording URL, extraction timings | 8 |
| `PATCH` | `/calls/:id/answers/:key` | Correct one extracted answer; returns the audit entry | 8 |
| `GET` | `/campaigns/:id/review` | Compliance checklist + blocking violations | 9 |
| `POST` | `/campaigns/:id/review/accept` | Record reviewer acceptance. **Fails if any violation is unresolved** | 9 |
| `GET` | `/suppression` | Do-not-contact list | 9 |
| `POST` | `/suppression` | Add numbers | 9 |
| `DELETE` | `/suppression/:id` | Remove one | 9 |
| `GET` | `/settings/providers` | Enabled providers, credentials status, credit balance | 9 |
| `PUT` | `/settings/:tab` | Save a settings tab | 9 |

### Core payloads

```ts
CandidatePage {
  rows: Candidate[]
  total: number
  nextCursor: string | null
  // Partial results are normal: render what arrived, name what is missing.
  providersSucceeded: Provider[]
  providersFailed: { provider: Provider; reason: string }[]
}

Candidate {
  id, name, title, company, location, phone      // phone E.164
  email: string | null                            // nulls are expected
  linkedinUrl: string | null
  yearsExperience: number
  matchScore: number                              // 0..1
  sources: Provider[]                             // which providers agreed
  callStatus: CallStatus | null
  lastCallAt: string | null
  suppressed: boolean
}

CallStatus = 'queued'|'dialing'|'connected'|'completed'|'failed'|'no_answer'|'blocked'
Provider   = 'pdl'|'apollo'|'proxycurl'|'coresignal'
```

**Per-field attribution** (phase 5) — the detail pane shows which provider supplied each
field and how confident it was:

```ts
SourcedField { value: string; source: Provider; confidence: number }
```

**Answers** (phase 6) — the table shows `normalised`; `rawSpan` is revealed on hover only,
never rendered as a column:

```ts
Answer {
  key: string
  normalised: string | number | boolean | null   // null = not extracted
  confidence: number                              // drives the underline
  rawSpan: { text: string; startMs: number; endMs: number } | null
  editedBy: string | null                         // set once a human corrects it
}
```

### SSE contract — the hard part

Both event streams (`/searches/:id/events`, `/campaigns/:id/events`) send:

```ts
{ eventId: string; seq: number; callId: string; status: CallStatus; ts: string }
```

The frontend assumes **at-least-once delivery**: it keeps a `Map<callId, seq>` and drops any
event whose `seq` is not greater than the one already seen. So the backend must guarantee
**`seq` is monotonically increasing per `callId`** — duplicates and out-of-order arrival are
handled, but a reused or reset `seq` will silently drop real updates.

On disconnect the frontend degrades to 5s polling and does a full refetch on reconnect, so
the stream can drop without data loss.

---

# PHASE 1 — Foundation ✅ COMPLETE

Vite scaffold, TS strict, Tailwind v4 tokens, six overridden shadcn primitives, API client
with the Zod boundary, MSW, providers, full router with every route stubbed.

**Verified:** `tsc -b` clean under `strict` + `noUncheckedIndexedAccess` +
`exactOptionalPropertyTypes` + `verbatimModuleSyntax`; build 110KB gzipped (budget 200KB); all
11 routes render in headless Chromium; `/review` renders with no shell (sibling route);
tokens applied (`#E9EDF1`, IBM Plex Sans); MSW serves 10,000 rows with a simulated provider
failure; 0 console errors; 40/40 tests pass.

**Landed decisions worth not re-litigating:**
- `globals.css` uses three layers — tokens in `@theme`, shadcn aliases in plain `:root`,
  `@theme inline` bridging them. Putting the aliases in `@theme` emits duplicate utilities.
- `/campaigns/:id/review` is a **sibling** of the shell layout route, not a child. Full-width
  is a routing decision; doing it in CSS means fighting the shell forever.
- Candidate detail is a **nested route**, never local state — URL shareable, back closes it.
- `vite`, `vitest`, `@vitest/coverage-v8`, `@tanstack/react-table` are pinned without carets.
  `latest` for react-table is v9; we need v8.
- npm has an arborist bug installing vitest (`edgesOut`); use `--legacy-peer-deps`.
- Node 22 required (`.nvmrc`).

---

# PHASE 2 — Shell

The frame every screen renders inside.

**`useUrlState<T>(schema, defaults)`** — `src/shared/hooks/useUrlState.ts`. Zod-backed
wrapper over `useSearchParams`. Garbage params **fail safe to defaults, never throw**.
`useMemo` on `searchParams.toString()` for referential stability. Setter merges, drops keys
equal to their default (short URLs), defaults to `replace: true` so typing in a filter box
doesn't create 40 history entries. Per-screen schemas use `z.coerce.number()` / `z.enum()`
since params are strings.

**Layout** — `src/shared/components/layout/`:
- `AppShell` — CSS grid, 56px rail + content. Built for 1600px; density is a first-class
  constraint, not a breakpoint afterthought.
- `NavRail` — icon nav, `aria-current="page"`, tooltip labels, keyboard reachable.
- `TopBar` — search context, credit balance (mono, tabular-nums), command palette trigger.
- `LiveStrip` — aggregate call counters. **Throttled from the start**: an `aria-live="polite"`
  region must not announce every tick; at 200 events/sec un-throttled it makes a screen reader
  unusable. Buffer, flush ~2s, announce totals ("42 calls active"), never per-call events.
  Retrofitting this means restructuring the data flow.
- `ThreePane` — resizable, widths persisted to localStorage via Zustand.

**Four feedback states** — `src/shared/components/feedback/`. Every list implements all four,
always:
- `Skeleton` — matches final row height **exactly** (36px). Skeletons, not spinners; a
  mismatched height is layout shift.
- `EmptyState` — an instruction plus a recovery action, not just "No data".
- `ErrorState` — what failed, and a retry.
- `PartialState` — the one that matters here: "3 of 4 providers returned; Proxycurl failed",
  rendering the data that arrived plus a retry for only the failed provider.

**Zustand scope** — one store, `src/shared/store/ui-store.ts`: pane widths, palette open, nav
collapsed. That is all. No server data, no filters. Say so in a comment at the top — this is
the boundary that erodes first under deadline.

**Gate:** `useUrlState` unit tests including garbage params → defaults; all four states render;
a pane throwing doesn't kill its siblings; skeleton measured at exactly 36px.

---

# PHASE 3 — DataTable

One table for the whole app. Four screens use it: results, answers, suppression, call queue.
Build it once, properly.

`src/shared/components/data-table/` — `DataTable.tsx`, `context.ts`, `Toolbar.tsx`,
`FilterPills.tsx`, `ColumnToggle.tsx`, `Export.tsx`, `Virtualised.tsx`, `EmptyState.tsx`,
`useCandidateTable.ts`, `useTableKeyboardNav.ts`, `csv.ts`.

**Headless hook** — `useCandidateTable<TData extends {id: string}>(opts): Table<TData>` returns
the instance; the component renders it. Testable without a DOM, reusable across four screens.
`getRowId: row => row.id` — **stable, never index-based**, or selection breaks the moment sort
order changes.

**Column defs live at module scope.** A fresh array identity each render resets TanStack
Table's internal column cache — sizing, visibility and order silently reset. Top runtime trap,
fails quietly. Needs props? `useMemo` with a genuinely stable dep array.

**Compound API:**
```tsx
<DataTable table={table}>
  <DataTable.Toolbar><DataTable.FilterPills/><DataTable.ColumnToggle/><DataTable.Export/></DataTable.Toolbar>
  <DataTable.Virtualised estimateSize={36} overscan={12}/>
  <DataTable.EmptyState>…</DataTable.EmptyState>
</DataTable>
```
Generics don't flow through JSX children: pass the instance via context typed `Table<unknown>`,
cast at each subcomponent boundary. A factory-per-row-type isn't worth it.

**`Virtualised.tsx` — four hard parts:**
1. **Sticky header + sticky first column together.** Plan the z-stack: header `z-20`, first
   column `z-10`, corner `z-30`. Wrong and the header slides under the pinned column on
   diagonal scroll.
2. **Virtualisation vs table semantics.** Virtual rows are absolutely positioned, which fights
   `<table>` layout. Use `display: grid` with explicit `grid-template-columns` from TanStack's
   column sizes, plus `role="table"/"rowgroup"/"row"/"cell"` and **`aria-rowcount` = total, not
   rendered**, so assistive tech reports 10,000 rather than 30.
3. **Keyboard nav** — roving `tabIndex` (one cell tabbable); arrows move, Enter opens, Space
   selects, Esc clears. Arrow moves **must call `virtualizer.scrollToIndex()`** when the target
   is outside the window, or focus lands on an unmounted row.
4. **Shift-range select** — `lastSelectedIndex` in a ref; select the inclusive span against the
   **sorted row model**, not the raw array.

**CSV export** — Blob + `URL.createObjectURL`, no library. Escape quotes/commas/newlines.
Visible columns in display order, honouring selection. **Prefix `=+-@` with `'`** to defuse
CSV injection — this lands in Excel.

**Gate (before any feature work):** 10,000 rows at 60fps in the Performance panel · DOM node
count flat (~30–50 rows) while scrolling · no layout shift skeleton→loaded · keyboard nav end
to end · shift-range selects the right count against sorted order · Playwright asserts both.

---

# PHASE 4 — Search flow

`/searches/new`, three stages in one route.

1. **JD input** → `POST /searches/parse-jd`. Textarea, paste-optimised. Parsing takes seconds:
   show a skeleton of the filter chips that are about to appear, not a spinner.
2. **Filter chips** — the parsed `SearchSpec` as editable chips (title, skills, seniority,
   location, experience range). Zod-validated per chip; invalid chips block submit and say why.
   react-hook-form owns this state.
3. **Provider plan + budget guard** → `GET /searches/:id/plan`. A table of per-provider
   estimated results and credits. **The total is stated in credits and currency before the
   button is live.** A run that would exceed the configured budget disables the button and
   names the overage — never a silent truncation. `POST /searches/:id/run` on confirm.

**Never optimistically update anything here** — every action spends credits.

---

# PHASE 5 — Results

`/searches/:searchId`, three-pane, with `/c/:candidateId` nested in pane 3.

- **Streaming load**: providers return over 5–30s. Rows appear as each lands; a strip names
  which providers are still working. Consume `GET /searches/:id/events`.
- **Partial results are a first-class state**, not an error. One provider failing while three
  succeed renders the data plus `PartialState` naming the failure and offering a retry for
  just that provider.
- **Per-field source attribution**: each field in the detail pane shows which provider supplied
  it. Where providers disagree, show the conflict rather than silently picking one.
- **Match score popover**: score is never a bare number — the popover breaks down what
  contributed.
- Selection feeds campaign creation (phase 6).

---

# PHASE 6 — Campaign dashboard

`/campaigns` list and `/campaigns/:campaignId`.

- **Funnel bar** — sourced → called → connected → qualified. Counts are mono/tabular. Each
  segment is a filter into the answer table.
- **Answer table** (DataTable) — one column per question. Cells show the **normalised value
  only**. Confidence renders as an underline weight, paired with a text label so colour and
  weight are never the sole carrier.
- **Raw transcript text is never a column.** The raw span is available on hover/expand only.
- CSV export of the answer set.
- Start/pause controls, gated on phase 9's compliance review.

---

# PHASE 7 — Live layer

The part that breaks under load if built naively.

1. `useEventSource` over `GET /campaigns/:id/events`.
2. **Sequence dedupe** — `Map<callId, seq>`, drop any event whose `seq` isn't greater. Delivery
   is at-least-once; assume duplicates and reordering. This reducer is pure and unit-tested
   independently of any component.
3. **Patch the cache, don't invalidate.** `setQueryData` on the affected row. Refetching 10k
   rows on every status tick kills the browser.
4. **Batch writes through a 100ms rAF-throttled queue** so 200 events in a second cause one
   render, not 200.
5. **Disconnect** → degraded indicator in the live strip, fall back to 5s polling, full refetch
   and reconcile on reconnect.
6. Live queue rail: currently-dialing calls, throttled the same way.

---

# PHASE 8 — Call detail

`/campaigns/:campaignId/c/:candidateId`, a drawer route.

- **Waveform** with extraction ticks marking where each answer was found. **Lazy-load the
  waveform library** — it's only needed here and would otherwise weigh down every route.
- **Transcript synced to playback**; clicking a line seeks, playing highlights.
- **Editable answers with an audit trail** → `PATCH /calls/:id/answers/:key`. Optimistic
  update *is* appropriate here (it neither spends credits nor places a call): full
  `onMutate` → `onError` rollback → `onSettled` invalidate. Every edit records who changed
  what, and the original stays visible.
- Audio playhead is ephemeral UI state → Zustand.

---

# PHASE 9 — Compliance and settings

- **Review gate** `/campaigns/:campaignId/review` — full-width, outside the shell. Checklist of
  what was verified, plus any blocking violations. **There is no override control. Not a
  button, not a confirm dialog, not a keyboard shortcut. Do not add one** — if the backend
  reports an unresolved violation, the UI has no path to start calling.
- **Suppression list** `/suppression` — DataTable over the do-not-contact set, add/remove,
  CSV import. `addToSuppression` is optimistic with rollback (it blocks calls rather than
  placing them, so being wrong is safe in the cautious direction).
- **Settings** `/settings/:tab` — providers (credentials status, credit balance), calling
  window (the 08:00–21:00 style guardrails and allowed days), voice agent config, team.

---

# PHASE 10 — Hardening

- **A11y pass** — one `axe-core` assertion per screen. Full keyboard operation. 2px accent
  focus ring never removed. Colour never the sole carrier. Live regions throttled. Drawers and
  dialogs: focus trapped, Esc closes, focus returns to trigger. `prefers-reduced-motion`
  disables the counter tick and queue slide. All text ≥ 4.5:1.
- **Performance** against the budget — 10k rows at 60fps, 200 events/sec at one render per
  frame, route chunks under 200KB gzipped, no layout shift.
- **E2E (Playwright)** — the full path: paste JD → edit filters → run search → select
  candidates → pass the compliance gate → start calling → read answers → open call detail →
  book interview.
- **Responsive degradation** — below 1200px the detail pane becomes a drawer; below 900px the
  app goes **read-only and says so** rather than shipping cramped, mis-tappable controls.

---

## Testing throughout

- **Unit (Vitest)**: formatters, Zod schemas, the SSE sequence-dedupe reducer, table filter
  logic, `useUrlState` fail-safe behaviour.
- **Component (Testing Library)**: each of the four list states, DataTable keyboard nav,
  optimistic rollback on mutation failure.
- **E2E (Playwright)**: the full recruiter path, plus the 10k-row perf assertions.

## Non-negotiables

- The compliance gate has **no override control** in the UI.
- **Never display raw transcript text** in the answer table — normalised values only, raw on
  hover.
- **Never optimistically update anything that spends credits or places a call.** Editing an
  extracted answer or adding a suppression is fine; running a search or starting a campaign
  is not.
- **Every API response is Zod-parsed** before it reaches a component.
- No `any`, no `@ts-ignore`, no disabled lint rules without an inline reason.

## State separation

| Kind | Home | Examples |
|---|---|---|
| Server | TanStack Query | candidates, campaigns, answers, call statuses |
| URL | `useUrlState` | filters, sort, selected row, active tab, column visibility |
| Ephemeral UI | Zustand | drawer open, palette open, pane widths, audio playhead |
| Form | react-hook-form | JD input, filter chips, settings |

Never mirror server data into Zustand. Never put filters in `useState`.

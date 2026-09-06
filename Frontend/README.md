# People Search & Reachout — recruiter console

Dense internal ops tool. Paste a job description → people-search providers (PDL, Apollo,
Proxycurl, Coresignal) find candidates → an AI voice agent calls them → answers land in a
filterable table.

Built for a 1600px monitor, 4+ hours of daily use, 10k+ row result sets and 200 concurrent
live calls. Optimised for information density and keyboard speed.

## Running it

Requires Node 22 (see `.nvmrc`).

```bash
nvm use
npm install
npm run dev      # http://localhost:5173 — MSW mocks every endpoint
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with MSW request mocking |
| `npm run build` | Typecheck, then production build |
| `npm run typecheck` | `tsc -b` only |
| `npm test` | Vitest run |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | oxlint |

Auth talks to the real backend (`VITE_API_BASE_URL`, default `http://localhost:8000`) — start
it first (`cd Backend && uv run uvicorn main:app --reload`). Every other endpoint is still
served by MSW handlers in `src/mocks/`, including a 10,000-row fixture used for the
virtualisation perf gate; MSW bypasses `/auth/*` to the real network.

## Layout

Feature-sliced. A feature owns its API calls, hooks, components and types; cross-feature
imports go through the feature's barrel, never into its internals.

```
src/
├── app/         router, providers, query client
├── features/    search · candidates · campaigns · calls · compliance · settings
├── shared/      api client · ui primitives · layout · hooks · lib · types
├── mocks/       MSW handlers and seeded fixtures
└── styles/      design tokens
```

## Conventions that are easy to break

**Every response is Zod-parsed** at `shared/api/client.ts` before a component sees it. Four
third-party providers sit behind one backend, so the data is inconsistent by nature — parse,
don't trust. That single boundary is what keeps `any` out of the app.

**`refetchOnWindowFocus` is off, deliberately.** A recruiter alt-tabbing must not re-run a
provider search: every refetch spends real credits. Don't "fix" it.

**State has four homes and they don't overlap.** Server state → TanStack Query. URL state
(filters, sort, selection, tabs) → `useUrlState`. Ephemeral UI (pane widths, palette open) →
Zustand. Forms → react-hook-form. Never mirror server data into Zustand; never put filters in
`useState`.

**Column definitions live at module scope.** A fresh array identity each render resets
TanStack Table's internal cache — sizing, visibility and order silently reset.

**Optional props that may be explicitly `undefined` are declared `?: T | undefined`.**
`exactOptionalPropertyTypes` is on, so `{foo?: string}` rejects `{foo: undefined}`.

**Type-only imports need `import type`** — `verbatimModuleSyntax` is on.

### Design tokens

Defined in `src/styles/globals.css` in three layers: our tokens under `@theme`, shadcn's
variable names aliased onto them under `:root`, and `@theme inline` bridging those aliases
back into utility space. Components consume tokens, never raw hex.

- Mono (`.machine`) is for machine data only — phone numbers, durations, timestamps, IDs,
  credits, costs. Numeric columns get `tabular-nums`.
- Signal colours appear only on call state and data quality. Never on chrome, never as a
  background wash, never as a gradient. Colour is never the sole carrier of meaning — signal
  badges pair it with a dot and a text label.
- Shadow is for modals, drawers and the command palette. Tables and panels use borders.
- Sentence case everywhere. No all-caps labels, no `→` in button text.

### Non-negotiables

- The compliance gate has **no override control** in the UI — not behind a confirm dialog.
- Never display raw transcript text in the answer table; normalised values only, raw on hover.
- Never optimistically update anything that spends credits or places a call.

## Authentication ✅

Not part of the original 10-phase plan — added once the backend's `/auth/login` existed.

- [x] `POST /auth/login` wired to the real backend (JWT, not MSW-mocked)
- [x] `features/auth`: Zod schemas, react-hook-form login form, `useLogin` mutation
- [x] Token persisted to `localStorage` via `shared/api/auth-token.ts`; `apiFetch` reads it
      and clears it on a 401
- [x] `useAuthStore` (Zustand) — session flag only, seeded from localStorage on load
- [x] `RequireAuth` route guard wraps the shell + compliance-review sibling; `/login` is
      the only public app route besides 404
- [x] Verified live against the real backend in headless Chromium: both accounts log in,
      wrong password shows the server's error, reload survives, clearing the token bounces
      back to `/login`

## Build phases

Full detail — API contract, exact traps, exit gates — lives in `.claude/PLAN.md`. This is the
checklist view.

### Phase 1 — Foundation ✅

- [x] Vite + React 19 + TypeScript strict scaffold, Node 22 pinned (`.nvmrc`)
- [x] `tsconfig.app.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
      `verbatimModuleSyntax`, `@/*` path alias
- [x] Tailwind v4 tokens in `globals.css` (three-layer `@theme` / `:root` / `@theme inline`
      bridge with shadcn's variable contract)
- [x] Six shadcn primitives overridden to tokens: Button, Input, Select, Badge, Table, Dialog
- [x] API client (`shared/api/client.ts`) — Zod-parse boundary, `ApiError` normalisation,
      `AbortSignal.any` timeout
- [x] Query key factory, query client (retry policy, `refetchOnWindowFocus: false`)
- [x] MSW: seeded fixture generator, handlers, browser + Vitest server setup
- [x] Providers (`ErrorBoundary` → `Query` → `Tooltip` → `Router`) and full router, every
      route stubbed and lazy
- [x] Exit gate verified: `tsc -b` clean, build 110KB gzipped, 11/11 routes render, MSW
      intercepts, tokens applied, 0 console errors, 40/40 tests

### Phase 2 — Shell

- [ ] `useUrlState<T>(schema, defaults)` — Zod-backed `useSearchParams` wrapper, garbage
      params fail safe to defaults
- [ ] `AppShell` — CSS grid, 56px rail + content, built for 1600px
- [ ] `NavRail` — icon nav, `aria-current`, keyboard reachable
- [ ] `TopBar` — search context, credit balance (mono/tabular-nums), command palette trigger
- [ ] `LiveStrip` — aggregate call counters, throttled `aria-live="polite"` (~2s flush, never
      per-event)
- [ ] `ThreePane` — resizable, widths persisted via Zustand
- [ ] Four feedback states: `Skeleton` (exact 36px), `EmptyState`, `ErrorState`, `PartialState`
- [ ] Zustand `ui-store.ts` scoped to pane widths / palette open / nav collapsed only
- [ ] Gate: `useUrlState` unit tests, all four states render, pane error boundary isolation,
      skeleton height measured

### Phase 3 — DataTable

- [ ] `useCandidateTable()` headless hook, stable `getRowId`, module-scope column defs
- [ ] Compound API: `DataTable`, `Toolbar`, `FilterPills`, `ColumnToggle`, `Export`,
      `Virtualised`, `EmptyState`
- [ ] `Virtualised.tsx`: sticky header + sticky first column (z-stack), grid-based virtual
      rows with correct `role`/`aria-rowcount`
- [ ] Keyboard nav: arrows (with `scrollToIndex`), Enter, Space, Esc
- [ ] Shift-range multi-select against the sorted row model
- [ ] CSV export (Blob, no library, quote/comma/newline escaping, CSV-injection guard)
- [ ] Gate: 10,000 rows at 60fps, flat DOM node count, no layout shift, keyboard nav e2e,
      Playwright shift-range assertion — **blocks all feature work until this passes**

### Phase 4 — Search flow

- [ ] JD input → `POST /searches/parse-jd`, skeleton while parsing
- [ ] Editable filter chips (react-hook-form + Zod) from the parsed `SearchSpec`
- [ ] Provider plan table → `GET /searches/:id/plan` (credits + currency per provider)
- [ ] Budget guard — over-budget disables run and names the overage, never truncates silently
- [ ] `POST /searches/:id/run` — no optimistic update (spends credits)

### Phase 5 — Results

- [ ] Three-pane `/searches/:searchId` layout with `/c/:candidateId` nested in pane 3
- [ ] Streaming load via `GET /searches/:id/events`, rows appear as providers return
- [ ] `PartialState` wired to real partial-result responses (not just the MSW simulation)
- [ ] Per-field source attribution in the detail pane, conflicts shown when providers disagree
- [ ] Match score popover with a breakdown, never a bare number
- [ ] Selection feeds campaign creation

### Phase 6 — Campaign dashboard

- [ ] Campaign list + detail routes wired to `GET /campaigns`, `GET /campaigns/:id`
- [ ] Funnel bar (sourced → called → connected → qualified), each segment filters the table
- [ ] Answer table (DataTable) — normalised values only, confidence as underline weight +
      label
- [ ] Raw transcript never a column — hover/expand only
- [ ] CSV export of the answer set
- [ ] Start/pause controls gated on Phase 9's compliance review

### Phase 7 — Live layer

- [ ] `useEventSource` over `GET /campaigns/:id/events`
- [ ] Sequence-dedupe reducer (`Map<callId, seq>`, drop non-increasing `seq`), unit-tested
      standalone
- [ ] Cache patched via `setQueryData`, never invalidate-and-refetch on a status tick
- [ ] 100ms rAF-throttled batched writes (200 events/sec → one render)
- [ ] Disconnect handling: degraded indicator, 5s polling fallback, full refetch on reconnect
- [ ] Live queue rail, throttled the same way

### Phase 8 — Call detail

- [ ] Drawer route `/campaigns/:campaignId/c/:candidateId`
- [ ] Waveform with extraction ticks, lazy-loaded (not in the main bundle)
- [ ] Transcript synced to playback (click-to-seek, play-to-highlight)
- [ ] Editable answers via `PATCH /calls/:id/answers/:key` — optimistic update *is* correct
      here, with full rollback cycle and audit trail
- [ ] Audio playhead as Zustand ephemeral state

### Phase 9 — Compliance and settings

- [ ] Full-width `/campaigns/:campaignId/review` (sibling route, no shell) — checklist +
      blocking violations
- [ ] **No override control anywhere on the review screen.** None. Do not add one.
- [ ] Suppression list (DataTable), add/remove, CSV import, optimistic add-with-rollback
- [ ] Settings tabs: providers, calling window/guardrails, voice agent, team

### Phase 10 — Hardening

- [ ] `axe-core` assertion on every screen
- [ ] Full keyboard operation audit, focus ring never removed, live regions throttled
- [ ] `prefers-reduced-motion` disables counter tick and queue slide
- [ ] Performance budget verified: 10k rows/60fps, 200 events/sec at one render/frame, route
      chunks <200KB gzipped
- [ ] Full E2E path: JD → filters → search → select → compliance gate → calling → answers →
      call detail → book interview
- [ ] Responsive: <1200px detail pane becomes a drawer; <900px read-only with a stated reason

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

There is no backend. Every endpoint is served by MSW handlers in `src/mocks/`, including a
10,000-row fixture used for the virtualisation perf gate.

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

## Build phases

Foundation, shell and DataTable are phases 1–3; the plan for all ten lives in
`.claude/PLAN.md`. Phase 3 gates on 10,000 rows scrolling at 60fps before feature work starts.

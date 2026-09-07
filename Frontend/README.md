# Frontend — recruiter console

React SPA for the people-search and reachout console. Paste a job
description → candidates are sourced and ranked → an AI voice agent calls
them → their answers land in a filterable table.

Built as a dense internal ops tool: designed for a 1600px monitor, hours of
daily use, 10k-row result sets, and live call events arriving in bursts.
Optimised for information density and keyboard speed, not for marketing
polish.

---

## Stack

| Piece | Choice | Why |
|---|---|---|
| Build | Vite 7 | Fast HMR; native ESM |
| UI | React 19 + TypeScript (strict) | — |
| Routing | React Router 7 (data router) | Lazy route modules, nested detail panes |
| Server state | TanStack Query | Caching, dedupe, background refresh |
| Tables | TanStack Table + Virtual | Headless; virtualisation for 10k rows |
| Forms | react-hook-form + Zod | One schema validates form *and* response |
| Styling | Tailwind v4 + shadcn primitives | Token-driven design system |
| Ephemeral UI state | Zustand | Only what isn't server or URL state |
| Mocking | MSW | Dev-only; proxies to the real API (see below) |
| Tests | Vitest | 45 tests |

---

## Local setup

**Requires Node 22** — pinned in `.nvmrc`. This matters: on Node 20 the test
suite fails to start with `webidl.util.markAsUncloneable is not a function`
(a jsdom/undici incompatibility, not a broken test).

```bash
cd Frontend
nvm use          # switches to Node 22
npm install
npm run dev      # http://localhost:5173
```

**Start the backend first.** Unlike a typical mocked frontend, MSW here
*proxies most endpoints through to the real API* at `http://localhost:8000`
— auth, JD parsing, searches, campaigns, calls and settings all hit real
persisted state. Without the backend running, login and everything past it
will fail. See [`../Backend/README.md`](../Backend/README.md).

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with MSW enabled |
| `npm run build` | Typecheck, then production build |
| `npm run typecheck` | `tsc -b` only |
| `npm test` | Vitest run (45 tests) |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | oxlint |

### Environment

Copy `.env.example` to `.env`. The only variable that matters locally:

| Variable | Local | Production |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` (MSW intercepts this prefix) | The full backend origin, e.g. `https://hunar-api-xxxx.onrender.com` — **no trailing slash** |

Vite inlines env vars **at build time**, so changing this in a hosting
dashboard requires a redeploy, not just a restart.

### Sign in

`varun30ec4@gmail.com` / `admin@123` (admin), or `user@hunar.ai.com` /
`hunar.ai@2021` (user).

---

## Where is what

Feature-sliced. A feature owns its API calls, hooks, components, schemas and
routes; cross-feature imports go through the feature's barrel (`index.ts`),
never into its internals.

```
src/
├── app/
│   ├── router.tsx        route tree — everything lazy except the shell
│   ├── providers.tsx     ErrorBoundary → Query → Tooltip → Router
│   └── query-client.ts   retry policy, refetchOnWindowFocus: false
├── features/
│   ├── auth/         login form, token storage, RequireAuth guard
│   ├── search/       JD input, filter chips, provider plan, run progress
│   ├── candidates/   result table + candidate detail pane
│   ├── campaigns/    campaign list/detail, funnel, answer table
│   ├── calls/        call detail drawer — transcript, answers
│   ├── compliance/   suppression list
│   ├── settings/     provider / calling / agent settings
│   └── tour/         product tour
├── shared/
│   ├── api/
│   │   ├── client.ts      apiFetch — Zod-parse boundary, auth, 401 refresh
│   │   ├── sse.ts         POST-based SSE reader (EventSource can't POST)
│   │   ├── auth-token.ts  token persistence
│   │   ├── errors.ts      ApiError normalisation
│   │   └── query-keys.ts  query key factory
│   ├── components/
│   │   ├── data-table/  DataTable compound component + virtualisation + CSV
│   │   ├── layout/      AppShell, NavRail, TopBar, RequireAuth
│   │   ├── feedback/    Skeleton, ErrorBoundary, RouteStub
│   │   └── ui/          shadcn primitives, retokenised
│   └── lib/             cn, formatters
├── mocks/               MSW handlers + seeded fixtures
└── styles/globals.css   design tokens
```

---

## Architecture decisions

### Every response is Zod-parsed before a component sees it

One boundary, in `shared/api/client.ts`. Multiple third-party providers sit
behind one backend, so the data is inconsistent *by nature* — parse, don't
trust. This single choke point is what keeps `any` out of the app: if a
provider changes a field, one schema fails loudly instead of `undefined`
propagating into a render three layers down.

### State has four homes and they don't overlap

| Kind | Home |
|---|---|
| Server data | TanStack Query |
| Filters, sort, selection, tabs | URL search params |
| Ephemeral UI (pane widths, palette open) | Zustand |
| Form fields | react-hook-form |

Never mirror server data into Zustand; never put filters in `useState`.
Filters in the URL means a recruiter can share a link to exactly what
they're looking at, and back/forward work.

### `refetchOnWindowFocus` is off, deliberately

A recruiter alt-tabbing must not re-run a provider search — every refetch
spends real credits. This is a correctness decision, not a performance one.

### Nothing that spends money updates optimistically

Searches, calls and credit-spending actions wait for the server. Optimistic
updates are used only where a rollback is harmless (editing a call answer,
adding a suppression entry).

---

## Challenges and how they were solved

### 1. 10,000 rows without dropping frames

The result set is large enough that rendering every row is not an option.
`data-table/Virtualised.tsx` uses TanStack Virtual with a sticky header and
a sticky first column, which is where it gets awkward: sticky positioning
inside a transformed virtual container needs a deliberate z-stack, and
virtual rows need correct `role` / `aria-rowcount` attributes because the
DOM no longer reflects the real row count for screen readers.

A related trap, easy to reintroduce: **column definitions live at module
scope**. Defining them inline gives the array a fresh identity every render,
which silently resets TanStack Table's internal cache — sizing, visibility
and column order all snap back with no error to explain why.

### 2. EventSource cannot POST

Every stream in this app carries a request body (a JD, a candidate
selection), and `EventSource` only issues GET requests. So
`shared/api/sse.ts` is a manual `fetch` + `ReadableStream` reader. The part
that bites: SSE frames are separated by a blank line and **arrive split
across chunks**, so the reader buffers until it sees a complete frame rather
than parsing whatever a chunk happens to contain.

### 3. The SSE reader bypassed the API client — twice over

`sse.ts` hardcoded `` fetch(`/api${path}`) `` instead of using the shared
`BASE_URL`. Locally this was invisible, because `/api` is exactly what MSW
intercepts. In production it broke: streaming requests went to the *frontend
host* (Vercel) rather than the API, returning a 404 from Vercel's router —
an error that looks like a backend bug but never reached the backend. It
also sent no `Authorization` header, so it would have 401'd immediately
after the URL was fixed.

Both callers (`search` and `campaigns`) were affected. The fix was in the
shared function, not at the call sites — `sse.ts` now reuses `BASE_URL` and
`authHeaders()` from `client.ts`, so there is one definition of "where the
API is" instead of two.

### 4. A trailing slash in an env var

A deployed `VITE_API_BASE_URL` ending in `/` produced
`https://api.example.com//auth/login`, which the backend answered with a
404. Rather than rely on remembering, `BASE_URL` now strips trailing slashes
at the source, so either spelling of the env var works.

### 5. Mocks that would have lied

Standard MSW usage returns canned fixtures. But most of this app's value is
in *real* provider behaviour — live credit balances, real ranking, real call
outcomes — and a fixture asserting "12 candidates found" would have proved
nothing about whether the pipeline works.

So the handlers in `src/mocks/handlers.ts` mostly **proxy through to the
real backend** rather than answer from fixtures. Two details that cost time:
GET and DELETE carry no body, and forwarding an empty string as one makes
some servers reject the request outright; and a 204 has no body to read
back, which `HttpResponse` rejects outright. Streaming responses need a
separate proxy that passes the body through untouched instead of buffering
it, or SSE stops being streaming.

What stays genuinely mocked: the 10,000-row fixture (a perf gate, not a
behaviour) and individual candidate lookups.

### 6. Strict TypeScript settings that reject ordinary-looking code

Three compiler options in `tsconfig.app.json` change how code must be
written, and each produces a confusing error the first time:

- `exactOptionalPropertyTypes` — `{foo?: string}` **rejects** `{foo: undefined}`. Props that may be explicitly undefined must be declared `?: T | undefined`.
- `verbatimModuleSyntax` — type imports must use `import type`.
- `noUncheckedIndexedAccess` — `array[0]` is `T | undefined`, so indexing needs a guard.

They stay on because they catch exactly the class of bug that third-party
data produces.

### 7. Live call events arrive faster than React should render

Call status ticks arrive in bursts. Two rules keep that from becoming a
render storm: the query cache is **patched** via `setQueryData` rather than
invalidated (an invalidate-and-refetch on every tick would hammer the API
for data already in hand), and `aria-live` regions are throttled rather than
announced per event — a screen reader reading every tick is unusable.

### 8. Node 20 silently fails the test suite

`npm test` on Node 20 dies with `webidl.util.markAsUncloneable is not a
function` from jsdom's undici dependency — an error that says nothing about
the actual cause. `.nvmrc` pins Node 22; `nvm use` before installing avoids
the whole detour. Under Node 22 the suite is 45/45 green.

---

## Design system

Tokens live in `src/styles/globals.css` in three layers: our tokens under
`@theme`, shadcn's variable names aliased onto them under `:root`, and
`@theme inline` bridging those aliases back into utility space. Components
consume tokens, never raw hex.

- **Mono (`.machine`) is for machine data only** — phone numbers, durations, timestamps, IDs, credits, costs. Numeric columns get `tabular-nums` so digits align down the column.
- **Signal colours appear only on call state and data quality.** Never on chrome, never as a background wash, never as a gradient. Colour is never the sole carrier of meaning: signal badges pair it with a dot and a text label.
- **Shadow is for modals, drawers and the command palette.** Tables and panels use borders.
- Sentence case everywhere. No all-caps labels.

## Non-negotiables

These are product rules, not preferences:

- The compliance gate has **no override control** in the UI — not even behind a confirm dialog.
- Never display raw transcript text in the answer table; normalised values only, raw on hover.
- Never optimistically update anything that spends credits or places a call.

---

## Deployment

Vercel. Set `VITE_API_BASE_URL` to the backend origin with **no trailing
slash** and redeploy (build-time inlining). MSW is disabled automatically in
production builds — `enableMocking()` returns early unless `import.meta.env.DEV`.

Full instructions: [`../DEPLOY.md`](../DEPLOY.md).

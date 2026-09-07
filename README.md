# Hunar.AI — People Search & Reachout Console

FDE assignment. A recruiter pastes a job description; the system sources
matching candidates from LinkedIn, enriches their contact details, places AI
voice calls to them, and returns the structured answers those calls produced
in a filterable table.

Two applications:

| | Stack | Docs |
|---|---|---|
| [`Backend/`](Backend/) | FastAPI · Postgres · SQLAlchemy async · Groq | [Backend/README.md](Backend/README.md) |
| [`Frontend/`](Frontend/) | React 19 · TypeScript · Vite · TanStack | [Frontend/README.md](Frontend/README.md) |

Deployment (Render + Vercel): [DEPLOY.md](DEPLOY.md).

---

## What it actually does

```
Job description
   │
   ▼  Groq LLM
Structured search spec  ──►  cost estimate from live provider balances
   │                          (nothing is spent before this is shown)
   ▼  Apify
LinkedIn profiles  ──►  normalise ──►  dedupe ──►  rank against the JD
   │
   ▼  Enrich.so
Email + validation  (Apollo.io when the account's plan allows it)
   │
   ▼  selection ──► suppression-list gate ──► Hunar Voice
AI phone calls  ──►  poll to completion  ──►  Groq Whisper transcript
   │
   ▼
Structured answers, per candidate, in the console
```

Every provider above is a **real integration** — there is no simulated
pipeline. That constraint is what produced most of the engineering problems
worth reading about, which each README documents in a "Challenges" section:

- **Backend** — verifying provider pricing against live APIs rather than
  marketing pages; ranking without embeddings (Groq has none); running
  calling jobs that outlive the HTTP request; why SSE can't use FastAPI's
  dependency-injected sessions; inferring speaker attribution from
  undiarised Whisper output; storing a do-not-call list without storing
  anyone's phone number.
- **Frontend** — 10k virtualised rows; POST-based SSE (EventSource can't
  POST); mocks that proxy to the real backend instead of lying; a streaming
  bug that only appeared in production.

## Running it locally

Backend first — the frontend proxies to it.

```bash
# Terminal 1
cd Backend
uv sync && cp .env.example .env      # fill in .env
docker compose up -d                 # Postgres
uv run alembic upgrade head
uv run uvicorn main:app --reload     # :8000

# Terminal 2
cd Frontend
nvm use && npm install               # Node 22 required
npm run dev                          # :5173
```

Sign in with `varun30ec4@gmail.com` / `admin@123`.

Full setup, environment variables and troubleshooting are in each
application's README.

## Tests

```bash
cd Backend  && uv run pytest   # 37 passed
cd Frontend && npm test        # 45 passed  (Node 22 — see Frontend README)
```

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

---

# Assignment question

> **Q3.** If there were no smartphones but LLMs exist / everything else
> exists except apps, and you are an HR who has to track attendance of
> 1000 people every day across 100 locations, what would you do?

## Answer

**The short version:** a distributed ledger made of paper and voice. Each
location keeps its own attendance board that anyone can read and challenge;
an LLM reachable by ordinary phone call acts as the tallying layer; and at
the end of each day every board is reconciled against a central record, so
disagreements surface immediately instead of silently becoming payroll
errors.

### The constraint, restated

No smartphones and no apps means there is no client software at the edge.
But three things remain: **paper**, **the telephone network**, and **an
LLM**. The design has to put all the intelligence in the one place that can
hold it — the centre — and keep the edge as dumb as a pen.

Averaged out, this is 10 people per location, which is small enough that a
human can verify a board at a glance. That fact is what makes the design
work.

### How it works

**1. Every location has a public board.**

At each of the 100 locations there is a large physical board — the day's
attendance register. One designated person (a supervisor, rotating) writes
the entries for that location: name, in-time, out-time.

The important property is that the board is **public and readable by
everyone whose name is on it**. Any of the ~10 people at that location can
walk past, see their own row, and object on the spot if it is wrong. That
turns attendance from a claim made *about* people into a record verified
*by* them — errors get caught within hours, by the person with the strongest
incentive to catch them, rather than at month-end by payroll.

**2. The board is read to the centre by voice, and an LLM does the typing.**

At the end of the day the supervisor makes one phone call and simply reads
the board aloud. An LLM on the other end transcribes it, parses the names
and times into structured rows, and reads back a summary — *"42 present, 3
absent, Priya marked half-day, is that right?"* — for the supervisor to
confirm before it is committed.

This is the part that has no equivalent without an LLM. Previously this
required either a data-entry clerk per region or a rigid touch-tone system
that could not handle "Ramesh came in at half past nine, he'd told me in
advance". Free-form speech in, structured records out, with a confirmation
step, is exactly what the technology is good at. **100 calls a day, a few
minutes each** is a tractable amount of work.

**3. End-of-day reconciliation across all boards.**

This is the ledger property. The centre now holds 100 location records for
the day. It checks them against each other and against what it already
knows:

- Does each location's headcount match its expected roster?
- Does anyone appear on **two** boards on the same day? (Either a
  transcription error or someone being marked present in two places.)
- Does any board show a total that contradicts the previous day's pattern
  without an explanation?

Anything that fails goes onto an **exceptions list** — and that list, not
the 1000 rows, is what HR actually looks at. On a normal day it is perhaps
a dozen entries. HR's job becomes resolving disagreements, not
transcribing data.

**4. The board stays the source of truth.**

If the central record and a location board disagree, the board wins until a
human decides otherwise — it is the one that the affected people actually
saw and had the chance to challenge. The central copy is a tally of the
boards, not a replacement for them. The physical board is also the audit
trail: it is dated, it is in the open, and it cannot be silently edited
after the fact the way a spreadsheet cell can.

### Why this shape, and not the alternatives

| Alternative | Why not |
|---|---|
| Central register only, phoned in individually | 1000 calls/day. No local verification — nobody at the edge ever sees what was recorded about them |
| Paper forms couriered to head office | Attendance is known days late; disputes are unresolvable because nobody remembers |
| Biometric/punch-card hardware at 100 sites | Real answer if the budget exists, but it is hardware procurement and maintenance across 100 sites, and it fails closed when a device breaks |
| Trust each location's monthly total | No verification layer at all. Errors and inflated headcounts are invisible by construction |

### What it borrows from a distributed ledger

The analogy is deliberate, and worth being precise about:

- **Replicated local copies** — each location holds its own record rather than everything living in one place that everyone must reach.
- **Public verifiability** — the people the record is *about* can read it and object. This is the property that does most of the real work.
- **Periodic reconciliation** — copies are checked against each other on a fixed cadence, and disagreement is surfaced rather than silently resolved.
- **Append-only in practice** — corrections are written as new dated entries next to the original, not erased, so the history of a dispute survives.

What it deliberately does **not** borrow: consensus algorithms, hashing,
immutability guarantees, or anything cryptographic. There is no adversarial
network here — just 100 locations that occasionally make mistakes. The
useful idea is *replicate locally, verify publicly, reconcile centrally*;
the machinery a real blockchain needs to defend against untrusted parties
would be pure overhead.

### Honest limitations

- **A supervisor can still write a false board.** Public reading deters it (their colleagues would notice a name marked present who isn't there), and cross-location duplicate detection catches some of it, but collusion at one site is not solved by this design. Spot audits are the answer, not more process.
- **Voice transcription will misread names.** Hence the read-back confirmation, and hence matching against a known roster rather than accepting free text — an unmatched name becomes an exception rather than a new employee.
- **It depends on a working phone line.** A missed call means that location falls back to reading the board the next morning; the board itself is never lost, which is the point of keeping it physical.

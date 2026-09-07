# Backend — recruiter console API

FastAPI service behind the recruiter console. It turns a pasted job
description into sourced candidates, enriches their contact details, places
AI voice calls, and stores the structured answers those calls produce.

Everything here talks to **real third-party APIs** — Apify, Enrich.so,
Apollo.io, Hunar Voice, Groq. There is no mock layer on this side; the
frontend owns the mocks. That decision drove most of the interesting
problems described in [Challenges](#challenges-and-how-they-were-solved).

---

## Stack

| Piece | Choice | Why |
|---|---|---|
| Web framework | FastAPI | Async-native; the pipeline is almost entirely I/O-bound waiting on providers |
| DB | Postgres 16 + `pgvector` image | Relational data with room for embeddings later |
| ORM | SQLAlchemy 2.x async + asyncpg | Async all the way down; no thread-pool bridge |
| Migrations | Alembic | One migration, `ba20f91a5597_initial_schema` |
| Validation | Pydantic v2 / pydantic-settings | Same models validate requests and load config |
| Auth | JWT (python-jose) + bcrypt | Access/refresh pair, separate secrets |
| LLM | Groq (`langchain-groq`) | JD parsing and Whisper transcription |
| Packaging | `uv` | Fast, lockfile-backed |

---

## Where is what

```
Backend/
├── main.py                  FastAPI app: CORS, logging config, router mounting
├── controllers/             HTTP layer only — routing, status codes, SSE framing
│   ├── auth_controller.py       /auth/login, /refresh, /logout
│   ├── search_controller.py     /searches/* — JD parse, plan, run (+ SSE variants)
│   ├── campaign_controller.py   /campaigns/* — create, list, calls, call stream
│   ├── settings_controller.py   campaign settings + suppression list
│   └── webhook_controller.py    /webhooks/apollo — async phone-reveal callback
├── services/                all business logic; controllers stay thin
│   ├── JD_Parse_service.py          JD text -> structured SearchSpec (Groq)
│   ├── provider_plan_service.py     cost estimate BEFORE anything is spent
│   ├── search_run_service.py        the end-to-end sourcing pipeline
│   ├── apify_service.py             LinkedIn people search (the sourcing provider)
│   ├── profile_extract_service.py   raw provider rows -> normalised profiles
│   ├── candidate_ranking_service.py JD/candidate match score + explanation
│   ├── enrich_service.py            Enrich.so email finder + validation
│   ├── apollo_service.py            Apollo.io enrichment (plan-blocked, see below)
│   ├── calling_service.py           bulk dial + poll to terminal state
│   ├── calling_jobs.py              background job registry + SSE broadcast
│   ├── hunar_call_service.py        Hunar Voice API client
│   ├── transcription_service.py     recording -> transcript (Groq Whisper)
│   └── campaign_service.py          campaign CRUD and candidate attachment
├── models/                  SQLAlchemy tables, grouped by domain
│   ├── tenancy.py     orgs, users
│   ├── search.py      searches, search_provider_runs
│   ├── candidates.py  candidates, field sources, provider records, search_results
│   ├── campaigns.py   campaigns, questions, campaign_candidates
│   ├── calls.py       attempts, events, answers, transcript segments
│   ├── compliance.py  suppression_list, compliance_checks, consent_records
│   └── ops.py         credit_ledger, audit_log, webhook_idempotency
├── dtos/                    Pydantic request/response shapes (the API contract)
├── core/                    config + pure helpers, no I/O
│   ├── provider_config.py   provider keys and verified pricing constants
│   ├── calling_config.py    Hunar + Groq keys
│   ├── auth_config.py       JWT settings and the two fixed accounts
│   ├── jwt.py               token encode/decode
│   ├── identifier_hash.py   salted hashing for suppression identifiers
│   └── agent_prompt.py      the voice agent's prompt template
├── Database/core.py         engine, session factory, FastAPI dependency
└── migrations/              Alembic
```

**Layering rule:** `controllers` → `services` → `models`. A controller never
runs a query and never calls a provider; a service never raises
`HTTPException`. Each service defines its own exception types and the
controller maps them to status codes. That is what keeps the pipeline
testable without an HTTP client.

---

## Local setup

**Prerequisites:** Python 3.12+, [`uv`](https://docs.astral.sh/uv/), Docker
(for Postgres).

```bash
cd Backend

# 1. Install dependencies (creates .venv from uv.lock)
uv sync

# 2. Configure environment
cp .env.example .env
#    Then fill in .env — see the table below.

# 3. Start Postgres (pgvector/pg16)
docker compose up -d

# 4. Apply the schema
uv run alembic upgrade head

# 5. Run the API
uv run uvicorn main:app --reload
```

API on `http://localhost:8000`, interactive docs at
`http://localhost:8000/docs`, health check at `/health`.

### Environment variables

`.env.example` is the authoritative list. What each one does:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection. A plain `postgres://` or `postgresql://` URL is fine — the driver is normalised automatically (see below) |
| `POSTGRES_USER` / `_PASSWORD` / `_DB` / `_PORT` | yes | Consumed by `docker-compose.yml` |
| `JWT_SECRET` | yes | Signs access tokens. Generate: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `JWT_REFRESH_SECRET` | yes | Signs refresh tokens. **Must differ** from `JWT_SECRET` |
| `GROQ_API_KEY` | yes | JD parsing + Whisper transcription |
| `APIFY_API_KEY` | yes | LinkedIn people search. Token starts `apify_api_` |
| `Enrich_API_KEY` | yes | Email finder + validation |
| `apollo_io_key` | no | Contact enrichment; degrades to "no contacts" when absent or plan-blocked |
| `HUNAR_AI_API_KEY` / `HUNAR_AGENT_ID` | for calling | Voice calls |
| `APOLLO_WEBHOOK_URL` | no | Public HTTPS callback for async phone reveal. Leave empty locally — Apollo cannot reach `localhost` |
| `CORS_ORIGINS` | yes in prod | Comma-separated allowed origins. Must include the deployed frontend's origin |
| `LOG_LEVEL` | no | Defaults to `INFO`; set `DEBUG` for verbose logs |

### Login accounts

There is no signup flow — "exactly one admin, exactly one user" is a fixed
business rule, so credentials live as bcrypt hashes in
`core/auth_config.py` rather than as seeded rows.

| Email | Password | Role |
|---|---|---|
| `varun30ec4@gmail.com` | `admin@123` | admin |
| `user@hunar.ai.com` | `hunar.ai@2021` | user |

### Tests

```bash
uv run pytest        # 37 tests, no DB or network required
```

Tests are colocated with the code they cover (`services/test_*.py`,
`Database/test_core.py`). They are deliberately pure — provider calls are
not hit, so the suite runs in well under a second and needs no credentials.

---

## Request flow

The main pipeline, end to end:

```
POST /searches/parse-jd     JD text  -> Groq -> structured SearchSpec
POST /searches/provider-plan spec    -> live credit balances -> cost estimate
POST /searches               spec    -> persisted search row
POST /searches/{id}/run      ---------------------------------------------┐
                                                                          │
  1. Apify LinkedIn search        raw profile rows                         │
  2. profile_extract_service      normalise (name, title, company, URL)    │
  3. upsert candidates            dedupe on LinkedIn slug                  │
  4. Enrich.so email finder       email + validation (Apollo if enabled)   │
  5. candidate_ranking_service    match score + matched-keyword list       │
  6. write search_results         ranked, ready for the UI                 │
                                                                          │
POST /campaigns              select candidates -> campaign  <──────────────┘
POST /campaigns/{id}/calls/stream
  1. suppression gate             drop anyone on the do-not-call list
  2. Hunar bulk dial              one call_attempt row per accepted dial
  3. poll to terminal state       persist every transition as it happens
  4. Groq Whisper                 transcribe the recording
  5. store call_answers           structured answers, one value column each
```

Both `/run` and `/calls/stream` have SSE variants so the UI shows real
progress instead of a spinner. Every stage above emits an event.

---

## Challenges and how they were solved

These are the problems that actually cost time. Each one is also commented
at the relevant source line.

### 1. Provider pricing had to be verified live, not read from marketing pages

Every cost constant in `core/provider_config.py` was confirmed by calling
the provider's own API on 2026-09-07, not copied from a pricing page. The
Apify actor's real `pricingInfos` (`GET /v2/acts/{id}`) revealed a
PAY_PER_EVENT model with two separate events — actor start (\$0.005) plus
per-profile-found (\$0.004) — which a flat per-result guess would have got
wrong. Enrich.so's *documented* base URL and auth header were both wrong;
the values in `enrich_service.py` are the ones that actually answered.

### 2. Apollo.io is plan-blocked, and the honest fix was to say so

Every Apollo person endpoint returns `403 API_INACCESSIBLE` on a free plan —
a plan-level block, not a malformed request (the documented shape was tried
verbatim). Rather than delete the integration or fake contacts, the service
stays, the 403 is recorded in `search_provider_runs`, and the UI states why
contacts are empty. The moment the key is upgraded, contacts appear with no
code change. Same reasoning for Enrich.so's phone lookup: 500 credits
against a ~97 balance, so the plan surfaces it as unreachable instead of
hiding it.

### 3. Ranking without embeddings

Groq — the only LLM provider this app has a key for — exposes **zero**
embedding models (confirmed against its own `/v1/models`). So semantic
vector ranking was off the table. `candidate_ranking_service.py` ranks by
weighted must-have / nice-to-have keyword overlap instead. The upside: the
score and its explanation are the *same computation*, so the "why did this
person rank here" popover shows the actual matched terms rather than a
post-hoc summary of a black-box number.

### 4. The deep-agent framework was slower than a plain call

JD parsing started on `create_deep_agent`'s full LangGraph scaffold. But the
task is one-shot text-in / JSON-out — no tools to call, no multi-step
planning — and the graph execution plus middleware measured **~1s+ of pure
overhead** for no benefit. It was cut entirely rather than trimmed down, and
`JD_Parse_service.py` is now a direct chat completion.

### 5. Calling runs must outlive the HTTP request that started them

Calls take minutes. If the recruiter closes the tab mid-run, the calls are
still happening and results **must** still be recorded. So a run is a
background `asyncio` task owning its own DB session
(`calling_jobs.py`), and SSE clients subscribe to a broadcast of its
events rather than driving it. Reconnecting replays events already emitted,
so a refreshed page catches up instead of showing an empty stream.

*Known ceiling, documented rather than hidden:* the job registry is
in-process, so a second uvicorn worker would not see these jobs. `render.yaml`
pins `numInstances: 1` for exactly this reason. Moving to Redis pub/sub is a
swap of that module's internals, not of its callers.

### 6. SSE and dependency-injected sessions don't mix

The obvious `db: AsyncSession = Depends(get_db)` breaks under
`StreamingResponse`: a yield-dependency commits when the *endpoint returns*,
which for a streaming response is **before the generator has run a single
line**. The stream would then write through a closed session. Both SSE
endpoints therefore build their own session from `get_session_factory()` and
own its commit/rollback explicitly — including committing on the failure
path so a `status='failed'` row survives.

### 7. Polling instead of webhooks, deliberately

Hunar supports `callback_config` webhooks, but those need a public HTTPS URL
that `localhost` is not. Rather than force ngrok into the setup steps, the
poller in `calling_service.py` works today, everywhere. Each call is
committed the moment *it* reaches a terminal state — not batched at the end —
so the recruiter sees each outcome as it happens rather than waiting on the
slowest call in the batch.

### 8. Phone numbers that look identical but don't match

Hunar normalises numbers server-side and echoes back the cleaned form
(`+916305741824`) even when the request sent `+91 6305741824`. Matching a
created call back to its candidate on the raw string therefore silently
missed, leaving the candidate queued with no attempt row and no error — a
failure with no symptom. `normalise_phone()` now runs on **both** sides
before comparison.

### 9. The voice API rejects calls with missing template variables

The agent's prompt templates four custom variables — `candidate_name`,
`job_role`, `company`, `location` — and Hunar returns `422 "Custom data keys
are not present"` if any is absent. An empty string is no better: it renders
into the prompt as a blank mid-sentence. `build_custom_data()` supplies
readable fallbacks for every key.

### 10. Transcripts had to be produced, not fetched

Hunar returns a recording URL but no transcript — confirmed three ways (no
field in the OpenAPI spec, none on a real completed call, no transcript
endpoint). The recruiter UI needs the actual conversation, so the `.wav` is
downloaded and run through Groq `whisper-large-v3`.

Whisper does no diarisation, so **speaker attribution is inferred**: the
patterns in `_attribute_speakers` are drawn from the agent's own prompt
("this is Neha", "this call is recorded", …), which means they track what
the agent is actually told to say rather than guessing at conversational
English. Inference, and labelled as such.

### 11. Suppression lists must not store what they protect

A do-not-call list is a list of people who asked *not* to be contacted —
holding their phone numbers in plaintext is precisely the data you don't
want to be holding. `suppression_list` stores only `identifier_hash`.
Two details matter: the hash is **salted** with `JWT_SECRET` (E.164 has a
small enough search space that unsalted SHA-256 would be trivially
brute-forced), and identifiers are **normalised before hashing** so
`+91 630 574 1824` and `+916305741824` produce one hash. The gate runs
*before* any dial, in `calling_service.py:132`.

### 12. Managed hosts hand out URLs SQLAlchemy can't use

Render, Heroku and Fly supply a driver-less `postgresql://` URL, and some
still use the legacy `postgres://` scheme. `create_async_engine` needs
`postgresql+asyncpg://` and fails at startup with an opaque error otherwise.
A pydantic `field_validator` in `Database/core.py` rewrites both forms, so
one place understands the difference instead of every deployment target
needing a hand-edited env var.

### 13. Logs that went nowhere

Every module did `logging.getLogger(__name__)`, but nothing ever configured
the root logger — so under uvicorn every record below ERROR was silently
dropped, which is a bad thing to discover while debugging a live deploy.
One `logging.basicConfig(..., force=True)` in `main.py` wires them all to
stdout (`force=True` is required to override uvicorn's own handler setup).
`LOG_LEVEL` tunes verbosity without a code change.

### 14. Token in a query string leaks into every log line

Apify accepts its token as a `?token=` query parameter, which is how it
ends up in access logs, error messages and stack traces — a 401 from Apify
printed the full credential. Noted in `apify_service.py`; the fix is to move
it to an `Authorization: Bearer` header.

---

## Deployment

See [`../DEPLOY.md`](../DEPLOY.md) — Render (Docker web service + managed
Postgres) for the API, Vercel for the frontend. Note the one-instance rule
in challenge 5 above.

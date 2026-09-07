import { http, HttpResponse } from 'msw'

import type { Campaign, CandidatePage } from '@/shared/types/domain'

import { generateCandidates, generateProviderOutcome } from './fixtures/candidates'

/* MSW v2 syntax throughout: http.get(path, ({ request, params }) => HttpResponse.json(...)).
   The v1 rest.get / res(ctx.json()) form does not exist any more. */

/** Built once — regenerating 10k rows per request would dominate the timings we measure. */
const LARGE_RESULT_SET = generateCandidates({ count: 10_000, seed: 42 })
const SMALL_RESULT_SET = generateCandidates({ count: 87, seed: 1337 })

const CAMPAIGNS: readonly Campaign[] = [
  {
    id: 'camp_001',
    name: 'Senior Backend — Bengaluru Q3',
    status: 'running',
    createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    candidateCount: 240,
    calledCount: 186,
    connectedCount: 94,
    qualifiedCount: 31,
    creditsSpent: 18_600,
  },
  {
    id: 'camp_002',
    name: 'Platform Engineers — remote India',
    status: 'awaiting_review',
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    candidateCount: 512,
    calledCount: 0,
    connectedCount: 0,
    qualifiedCount: 0,
    creditsSpent: 0,
  },
  {
    id: 'camp_003',
    name: 'ML Engineers — Hyderabad',
    status: 'completed',
    createdAt: new Date(Date.now() - 21 * 86_400_000).toISOString(),
    candidateCount: 130,
    calledCount: 130,
    connectedCount: 71,
    qualifiedCount: 24,
    creditsSpent: 13_000,
  },
]

/** In-memory searches created via POST /api/searches, keyed by id. */
const SEARCHES = new Map<string, unknown>()
let nextSearchSeq = 1

/**
 * Real backend, not mocked. apiFetch's BASE_URL stays relative (/api) so
 * every other MSW handler below keeps matching same-origin requests as usual —
 * these two handlers alone forward to the actual FastAPI server on :8000,
 * since login and JD parsing both need real backend behaviour (bcrypt/JWT,
 * an actual LLM extraction) that a canned mock can't stand in for.
 */
const REAL_BACKEND_URL = 'http://localhost:8000'

async function proxyToRealBackend(request: Request, backendPath: string) {
  const response = await fetch(`${REAL_BACKEND_URL}${backendPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  })
  const body = await response.text()
  return new HttpResponse(body, {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Same idea as proxyToRealBackend, but passes the response body through as a
 * live stream instead of buffering it with .text() — buffering would defeat
 * the entire point of SSE, delivering every progress event at once instead
 * of as the backend produces them.
 */
async function proxyStreamToRealBackend(request: Request, backendPath: string) {
  const response = await fetch(`${REAL_BACKEND_URL}${backendPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: await request.text(),
  })
  return new HttpResponse(response.body, {
    status: response.status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

export const handlers = [
  http.post('/api/auth/login', ({ request }) => proxyToRealBackend(request, '/auth/login')),

  http.post('/api/searches/parse-jd', ({ request }) =>
    proxyToRealBackend(request, '/searches/parse-jd'),
  ),

  http.post('/api/searches/parse-jd/stream', ({ request }) =>
    proxyStreamToRealBackend(request, '/searches/parse-jd/stream'),
  ),

  /** Real cost math against confirmed-live provider pricing — see
   *  Backend/services/provider_plan_service.py. Not mocked, same reason as
   *  parse-jd: a canned response can't reflect Enrich.so's actual remaining
   *  credit balance. */
  http.post('/api/searches/provider-plan', ({ request }) =>
    proxyToRealBackend(request, '/searches/provider-plan'),
  ),

  http.get('/api/campaigns', () => HttpResponse.json(CAMPAIGNS)),

  /** Stage 2 -> 3: create a search row from the edited spec. */
  http.post('/api/searches', async ({ request }) => {
    const spec = await request.json()
    const searchId = `search_${String(nextSearchSeq).padStart(4, '0')}`
    nextSearchSeq += 1
    SEARCHES.set(searchId, spec)
    return HttpResponse.json({ searchId })
  }),

  http.post('/api/searches/:searchId/run', ({ params }) => {
    if (!SEARCHES.has(String(params['searchId']))) {
      return HttpResponse.json({ message: 'Search not found.' }, { status: 404 })
    }
    return HttpResponse.json({ status: 'running' })
  }),

  http.get('/api/campaigns/:campaignId', ({ params }) => {
    const campaign = CAMPAIGNS.find((row) => row.id === params['campaignId'])
    if (!campaign) {
      return HttpResponse.json({ message: 'Campaign not found.' }, { status: 404 })
    }
    return HttpResponse.json(campaign)
  }),

  /**
   * Results. `?size=large` returns the 10k set used for the Phase 3 perf gate;
   * `?partial=1` simulates three providers answering and one failing.
   */
  http.get('/api/searches/:searchId/results', ({ request }) => {
    const url = new URL(request.url)
    const rows = url.searchParams.get('size') === 'large' ? LARGE_RESULT_SET : SMALL_RESULT_SET

    const outcome =
      url.searchParams.get('partial') === '1'
        ? generateProviderOutcome()
        : { succeeded: ['apify', 'pdl', 'coresignal'] as const, failed: [] }

    const page: CandidatePage = {
      rows,
      total: rows.length,
      providersSucceeded: [...outcome.succeeded],
      providersFailed: [...outcome.failed],
    }
    return HttpResponse.json(page)
  }),

  http.get('/api/candidates/:candidateId', ({ params }) => {
    const candidate =
      SMALL_RESULT_SET.find((row) => row.id === params['candidateId']) ??
      LARGE_RESULT_SET.find((row) => row.id === params['candidateId'])
    if (!candidate) {
      return HttpResponse.json({ message: 'Candidate not found.' }, { status: 404 })
    }
    return HttpResponse.json(candidate)
  }),

  http.get('/api/suppression', () =>
    HttpResponse.json({
      rows: SMALL_RESULT_SET.filter((row) => row.suppressed),
      total: SMALL_RESULT_SET.filter((row) => row.suppressed).length,
      providersSucceeded: ['pdl'],
      providersFailed: [],
    } satisfies CandidatePage),
  ),
]

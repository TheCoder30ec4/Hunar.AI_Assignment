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
 * Real auth backend, not mocked. apiFetch's BASE_URL stays relative (/api) so
 * every other MSW handler below keeps matching same-origin requests as usual —
 * this handler alone forwards to the actual FastAPI server on :8000.
 */
const AUTH_BACKEND_URL = 'http://localhost:8000'

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const response = await fetch(`${AUTH_BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
    })
    const body = await response.text()
    return new HttpResponse(body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }),

  http.get('/api/campaigns', () => HttpResponse.json(CAMPAIGNS)),

  /** Stage 1: pretend to run the JD through an extraction model. */
  http.post('/api/searches/parse-jd', async ({ request }) => {
    const body = (await request.json()) as { jdText?: string }
    const jdText = body.jdText ?? ''

    // A tiny heuristic so the mock feels responsive to what was pasted,
    // rather than always returning the exact same canned spec.
    const looksSenior = /senior|staff|lead|principal/i.test(jdText)
    const looksRemote = /remote/i.test(jdText)

    return HttpResponse.json({
      spec: {
        title: 'Senior Backend Engineer',
        skills: ['Python', 'PostgreSQL', 'Kubernetes'],
        seniority: looksSenior ? 'senior' : 'mid',
        location: looksRemote ? 'Remote (India)' : 'Bengaluru, Karnataka, India',
        minYearsExperience: looksSenior ? 5 : 2,
        maxYearsExperience: looksSenior ? 10 : 5,
      },
    })
  }),

  /** Stage 2 -> 3: create a search row from the edited spec. */
  http.post('/api/searches', async ({ request }) => {
    const spec = await request.json()
    const searchId = `search_${String(nextSearchSeq).padStart(4, '0')}`
    nextSearchSeq += 1
    SEARCHES.set(searchId, spec)
    return HttpResponse.json({ searchId })
  }),

  /** Stage 3: per-provider cost estimate, deliberately over budget by default
   *  so the budget guard is exercised without extra test setup. */
  http.get('/api/searches/:searchId/plan', ({ params }) => {
    if (!SEARCHES.has(String(params['searchId']))) {
      return HttpResponse.json({ message: 'Search not found.' }, { status: 404 })
    }
    return HttpResponse.json({
      rows: [
        { provider: 'pdl', estimatedResults: 340, estimatedCredits: 340 },
        { provider: 'apollo', estimatedResults: 210, estimatedCredits: 420 },
        { provider: 'proxycurl', estimatedResults: 180, estimatedCredits: 180 },
        { provider: 'coresignal', estimatedResults: 95, estimatedCredits: 190 },
      ],
      totalCredits: 1130,
      budgetCredits: 1000,
      currency: 'INR',
    })
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
        : { succeeded: ['pdl', 'apollo', 'proxycurl', 'coresignal'] as const, failed: [] }

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

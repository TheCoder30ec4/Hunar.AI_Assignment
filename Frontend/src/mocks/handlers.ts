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

export const handlers = [
  http.get('/api/campaigns', () => HttpResponse.json(CAMPAIGNS)),

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

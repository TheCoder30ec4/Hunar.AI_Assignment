import { http, HttpResponse } from 'msw'

import type { CandidatePage } from '@/shared/types/domain'

import { generateCandidates } from './fixtures/candidates'

/* MSW v2 syntax throughout: http.get(path, ({ request, params }) => HttpResponse.json(...)).
   The v1 rest.get / res(ctx.json()) form does not exist any more. */

/** Still mocked: candidate detail + suppression fixtures (no backend yet). */
const SMALL_RESULT_SET = generateCandidates({ count: 87, seed: 1337 })

/**
 * Real backend, not mocked. apiFetch's BASE_URL stays relative (/api) so
 * every other MSW handler below keeps matching same-origin requests as usual —
 * these handlers alone forward to the actual FastAPI server on :8000, for
 * everything with real persisted state (auth, JD parsing, searches,
 * campaigns) that a canned mock can't stand in for.
 */
const REAL_BACKEND_URL = 'http://localhost:8000'

async function proxyToRealBackend(request: Request, backendPath: string) {
  const response = await fetch(`${REAL_BACKEND_URL}${backendPath}`, {
    method: request.method,
    headers: { 'Content-Type': 'application/json' },
    ...(request.method === 'GET' ? {} : { body: await request.text() }),
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

  /** Campaigns and the search-run pipeline all have real persisted state
   * now (Backend/controllers/campaign_controller.py, search_controller.py) —
   * proxied like parse-jd/provider-plan above, not mocked. */
  http.get('/api/campaigns', ({ request }) => proxyToRealBackend(request, '/campaigns')),
  http.post('/api/campaigns', ({ request }) => proxyToRealBackend(request, '/campaigns')),
  http.get('/api/campaigns/:campaignId', ({ request, params }) =>
    proxyToRealBackend(request, `/campaigns/${String(params['campaignId'])}`),
  ),

  http.post('/api/searches', ({ request }) => proxyToRealBackend(request, '/searches')),

  http.post('/api/searches/:searchId/run', ({ request, params }) =>
    proxyToRealBackend(request, `/searches/${String(params['searchId'])}/run`),
  ),
  http.post('/api/searches/:searchId/run/stream', ({ request, params }) =>
    proxyStreamToRealBackend(request, `/searches/${String(params['searchId'])}/run/stream`),
  ),

  http.get('/api/searches/:searchId/results', ({ request, params }) =>
    proxyToRealBackend(request, `/searches/${String(params['searchId'])}/results`),
  ),
  http.post('/api/searches/:searchId/candidates', ({ request, params }) =>
    proxyToRealBackend(request, `/searches/${String(params['searchId'])}/candidates`),
  ),

  http.get('/api/candidates/:candidateId', ({ params }) => {
    const candidate = SMALL_RESULT_SET.find((row) => row.id === params['candidateId'])
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

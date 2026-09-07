import { apiFetch } from '@/shared/api/client'
import { apiErrorFromThrown } from '@/shared/api/errors'
import { readSseStream } from '@/shared/api/sse'
import { asSearchId, type SearchId } from '@/shared/types/ids'

import {
  createSearchResponseSchema,
  jdExtractionSchema,
  jdExtractionToSearchSpec,
  parseJdStreamEventSchema,
  providerPlanSchema,
  rankedCandidateSchema,
  runSearchResponseSchema,
  runSearchStreamEventSchema,
  searchResultsSchema,
  searchSpecToCreateSearchRequest,
  type AddCandidateRequest,
  type ParseJdProgressEvent,
  type ProviderPlan,
  type RunSearchResult,
  type RunSearchStreamEvent,
  type SearchResults,
  type SearchSpec,
} from '../schemas/search-spec'

/**
 * Calls the real backend (Backend/controllers/search_controller.py), not a
 * mock — MSW forwards /api/searches/parse-jd to the real FastAPI server the
 * same way it forwards /api/auth/login, since this needs the actual LLM
 * extraction, not a canned response.
 */
export async function parseJd(jdText: string, signal?: AbortSignal): Promise<SearchSpec> {
  const extraction = await apiFetch('/searches/parse-jd', {
    method: 'POST',
    body: { jd_text: jdText },
    schema: jdExtractionSchema,
    signal,
  })
  return jdExtractionToSearchSpec(extraction)
}

/**
 * The streaming variant of parseJd: yields progress events as they arrive,
 * then resolves with the final SearchSpec.
 */
export async function* parseJdStream(
  jdText: string,
  signal?: AbortSignal,
): AsyncGenerator<ParseJdProgressEvent, SearchSpec, void> {
  for await (const raw of readSseStream('/searches/parse-jd/stream', { jd_text: jdText }, signal)) {
    const parsed = parseJdStreamEventSchema.safeParse(raw)
    if (!parsed.success) {
      throw apiErrorFromThrown(new Error('The parser stream returned an unexpected event shape.'))
    }
    if (parsed.data.type === 'error') throw apiErrorFromThrown(new Error(parsed.data.message))
    if (parsed.data.type === 'result') return jdExtractionToSearchSpec(parsed.data.data)
    yield parsed.data
  }
  throw apiErrorFromThrown(new Error('The parser stream ended without a result.'))
}

export async function createSearch(
  spec: SearchSpec,
  jdText: string,
  signal?: AbortSignal,
): Promise<SearchId> {
  const response = await apiFetch('/searches', {
    method: 'POST',
    body: searchSpecToCreateSearchRequest(spec, jdText),
    schema: createSearchResponseSchema,
    signal,
  })
  return asSearchId(response.search_id)
}

/**
 * Calls the real backend (Backend/services/provider_plan_service.py) — not
 * mocked. Cost math runs against confirmed-live provider pricing, and
 * Enrich.so's credit balance is read from that service's own last-known
 * value, so this must hit the real server, not a canned MSW response.
 */
export function getProviderPlan(
  resultsNeeded: number,
  signal?: AbortSignal,
): Promise<ProviderPlan> {
  return apiFetch('/searches/provider-plan', {
    method: 'POST',
    body: { results_needed: resultsNeeded },
    schema: providerPlanSchema,
    signal,
  })
}

/**
 * Starts the search. Never called optimistically — this is the exact
 * moment credits get spent against real provider APIs.
 */
export async function runSearch(
  searchId: SearchId,
  resultsNeeded: number,
  signal?: AbortSignal,
): Promise<RunSearchResult> {
  return apiFetch(`/searches/${searchId}/run`, {
    method: 'POST',
    body: { results_needed: resultsNeeded },
    schema: runSearchResponseSchema,
    signal,
  })
}

export interface RunSearchOutcome {
  readonly searchId: SearchId
  readonly candidatesFound: number
  readonly contactsFound: number
}

/**
 * Streaming run: real stage events while Apify/Groq/Apollo/Enrich.so do
 * their work. The recruiter then picks candidates on the results page.
 * Same credit warning as runSearch — this is the call that spends money.
 */
export async function* runSearchStream(
  searchId: SearchId,
  resultsNeeded: number,
  signal?: AbortSignal,
): AsyncGenerator<Extract<RunSearchStreamEvent, { type: 'progress' }>, RunSearchOutcome, void> {
  for await (const raw of readSseStream(
    `/searches/${searchId}/run/stream`,
    { results_needed: resultsNeeded },
    signal,
  )) {
    const parsed = runSearchStreamEventSchema.safeParse(raw)
    if (!parsed.success) {
      throw apiErrorFromThrown(new Error('The search stream returned an unexpected event shape.'))
    }
    if (parsed.data.type === 'error') throw apiErrorFromThrown(new Error(parsed.data.message))
    if (parsed.data.type === 'result') {
      return {
        searchId: asSearchId(parsed.data.search_id),
        candidatesFound: parsed.data.candidates_found,
        contactsFound: parsed.data.contacts_found,
      }
    }
    yield parsed.data
  }
  throw apiErrorFromThrown(new Error('The search stream ended without a result.'))
}

export function getSearchResults(searchId: SearchId, signal?: AbortSignal): Promise<SearchResults> {
  return apiFetch(`/searches/${searchId}/results`, { schema: searchResultsSchema, signal })
}

/** Manual add — the person is created and ranked into this search server-side. */
export function addCandidate(searchId: SearchId, body: AddCandidateRequest) {
  return apiFetch(`/searches/${searchId}/candidates`, {
    method: 'POST',
    body,
    schema: rankedCandidateSchema,
  })
}

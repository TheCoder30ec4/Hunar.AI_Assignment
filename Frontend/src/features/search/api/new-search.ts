import { apiFetch } from '@/shared/api/client'
import type { SearchId } from '@/shared/types/ids'
import { asSearchId } from '@/shared/types/ids'

import {
  createSearchResponseSchema,
  jdExtractionSchema,
  jdExtractionToSearchSpec,
  providerPlanSchema,
  runSearchResponseSchema,
  type ProviderPlan,
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

export async function createSearch(spec: SearchSpec, signal?: AbortSignal): Promise<SearchId> {
  const response = await apiFetch('/searches', {
    method: 'POST',
    body: spec,
    schema: createSearchResponseSchema,
    signal,
  })
  return asSearchId(response.searchId)
}

export function getProviderPlan(searchId: SearchId, signal?: AbortSignal): Promise<ProviderPlan> {
  return apiFetch(`/searches/${searchId}/plan`, { schema: providerPlanSchema, signal })
}

/**
 * Starts the search. Never called optimistically — this is the exact
 * moment credits get spent against real provider APIs.
 */
export async function runSearch(searchId: SearchId, signal?: AbortSignal): Promise<void> {
  await apiFetch(`/searches/${searchId}/run`, {
    method: 'POST',
    schema: runSearchResponseSchema,
    signal,
  })
}

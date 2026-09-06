import { apiFetch } from '@/shared/api/client'
import type { SearchId } from '@/shared/types/ids'
import { asSearchId } from '@/shared/types/ids'

import {
  createSearchResponseSchema,
  parseJdResponseSchema,
  providerPlanSchema,
  runSearchResponseSchema,
  type ProviderPlan,
  type SearchSpec,
} from '../schemas/search-spec'

export async function parseJd(jdText: string, signal?: AbortSignal): Promise<SearchSpec> {
  const response = await apiFetch('/searches/parse-jd', {
    method: 'POST',
    body: { jdText },
    schema: parseJdResponseSchema,
    signal,
  })
  return response.spec
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

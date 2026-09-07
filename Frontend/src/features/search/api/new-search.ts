import { apiFetch } from '@/shared/api/client'
import { apiErrorFromThrown } from '@/shared/api/errors'
import type { SearchId } from '@/shared/types/ids'
import { asSearchId } from '@/shared/types/ids'

import {
  createSearchResponseSchema,
  jdExtractionSchema,
  jdExtractionToSearchSpec,
  parseJdStreamEventSchema,
  providerPlanSchema,
  runSearchResponseSchema,
  type ParseJdProgressEvent,
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

/**
 * The streaming variant of parseJd: yields progress events as they arrive,
 * then resolves with the final SearchSpec. Uses fetch + a manual stream
 * reader rather than EventSource — EventSource only issues GET requests,
 * and the JD text needs to go in a POST body.
 */
export async function* parseJdStream(
  jdText: string,
  signal?: AbortSignal,
): AsyncGenerator<ParseJdProgressEvent, SearchSpec, void> {
  const response = await fetch('/api/searches/parse-jd/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jd_text: jdText }),
    ...(signal ? { signal } : {}),
  })

  if (!response.ok || !response.body) {
    throw apiErrorFromThrown(new Error(`Stream request failed with status ${String(response.status)}`))
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  // SSE frames are separated by a blank line; a frame can arrive split
  // across multiple stream chunks, so buffer until a full frame is seen.
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value

    let frameBreak: number
    while ((frameBreak = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, frameBreak)
      buffer = buffer.slice(frameBreak + 2)

      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
      if (!dataLine) continue

      const parsed = parseJdStreamEventSchema.safeParse(JSON.parse(dataLine.slice('data: '.length)))
      if (!parsed.success) {
        throw apiErrorFromThrown(new Error('The parser stream returned an unexpected event shape.'))
      }

      if (parsed.data.type === 'error') {
        throw apiErrorFromThrown(new Error(parsed.data.message))
      }
      if (parsed.data.type === 'result') {
        return jdExtractionToSearchSpec(parsed.data.data)
      }
      yield parsed.data
    }
  }

  throw apiErrorFromThrown(new Error('The parser stream ended without a result.'))
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

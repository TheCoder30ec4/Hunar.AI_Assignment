import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { isApiError } from '@/shared/api/errors'
import { qk } from '@/shared/api/query-keys'
import type { SearchId } from '@/shared/types/ids'

import { createSearch, getProviderPlan, parseJd, parseJdStream, runSearch } from '../api/new-search'
import type { SearchSpec } from '../schemas/search-spec'

/** Stage 1: JD text in, parsed SearchSpec out. Not cached — a re-paste is a fresh parse. */
export function useParseJd() {
  return useMutation({
    mutationFn: (jdText: string) => parseJd(jdText),
  })
}

interface ParseJdStreamState {
  readonly status: 'idle' | 'streaming' | 'success' | 'error'
  readonly stage: string | null
  readonly percent: number
  readonly errorMessage: string | null
}

/**
 * Streaming counterpart to useParseJd — not TanStack Query, since this is a
 * one-shot progress stream with no server state to cache, not a query
 * result. Deliberately its own tiny state machine rather than a mutation:
 * a mutation has no slot for the intermediate progress events a component
 * needs to render a progress bar.
 */
export function useParseJdStream() {
  const [state, setState] = useState<ParseJdStreamState>({
    status: 'idle',
    stage: null,
    percent: 0,
    errorMessage: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback((jdText: string, onSuccess: (spec: SearchSpec) => void) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState({ status: 'streaming', stage: null, percent: 0, errorMessage: null })

    void (async () => {
      try {
        const stream = parseJdStream(jdText, controller.signal)
        let next = await stream.next()
        while (!next.done) {
          setState({
            status: 'streaming',
            stage: next.value.stage,
            percent: next.value.percent,
            errorMessage: null,
          })
          next = await stream.next()
        }
        setState({ status: 'success', stage: null, percent: 100, errorMessage: null })
        onSuccess(next.value)
      } catch (error) {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          stage: null,
          percent: 0,
          errorMessage: isApiError(error) ? error.message : 'Could not parse the job description.',
        })
      }
    })()
  }, [])

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState({ status: 'idle', stage: null, percent: 0, errorMessage: null })
  }, [])

  return { ...state, start, reset }
}

/** Stage 2 -> 3: the edited spec becomes a search row, which unlocks the plan query. */
export function useCreateSearch() {
  return useMutation({
    mutationFn: (spec: SearchSpec) => createSearch(spec),
  })
}

export function useProviderPlan(searchId: SearchId | null) {
  return useQuery({
    queryKey: searchId ? qk.search.providerPlan(searchId) : ['search', 'provider-plan', 'idle'],
    queryFn: ({ signal }) => {
      if (!searchId) throw new Error('useProviderPlan called before a search exists')
      return getProviderPlan(searchId, signal)
    },
    enabled: searchId !== null,
  })
}

/** Stage 3 confirm: spends real provider credits. Never optimistic. */
export function useRunSearch() {
  return useMutation({
    mutationFn: (searchId: SearchId) => runSearch(searchId),
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { isApiError } from '@/shared/api/errors'
import { qk } from '@/shared/api/query-keys'
import type { SearchId } from '@/shared/types/ids'

import {
  addCandidate,
  createSearch,
  getProviderPlan,
  getSearchResults,
  parseJd,
  parseJdStream,
  runSearch,
  runSearchStream,
  type RunSearchOutcome,
} from '../api/new-search'
import type { AddCandidateRequest, SearchSpec } from '../schemas/search-spec'

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
    mutationFn: ({ spec, jdText }: { readonly spec: SearchSpec; readonly jdText: string }) =>
      createSearch(spec, jdText),
  })
}

/** resultsNeeded is the recruiter's own input (how many candidates they
 * want), not a system estimate — the plan recomputes live as they change it.
 * null means "not entered yet"; the query stays disabled until then so it
 * never fires with a meaningless count.
 */
export function useProviderPlan(resultsNeeded: number | null) {
  return useQuery({
    queryKey:
      resultsNeeded !== null
        ? qk.search.providerPlan(resultsNeeded)
        : ['search', 'provider-plan', 'idle'],
    queryFn: ({ signal }) => {
      if (resultsNeeded === null) throw new Error('useProviderPlan called before a count was entered')
      return getProviderPlan(resultsNeeded, signal)
    },
    enabled: resultsNeeded !== null && resultsNeeded > 0,
  })
}

/** Stage 3 confirm: spends real provider credits. Never optimistic. */
export function useRunSearch() {
  return useMutation({
    mutationFn: ({
      searchId,
      resultsNeeded,
    }: {
      readonly searchId: SearchId
      readonly resultsNeeded: number
    }) => runSearch(searchId, resultsNeeded),
  })
}

export interface RunSearchStreamState {
  readonly status: 'idle' | 'streaming' | 'success' | 'error'
  /** Every stage seen so far, in order — rendered as a log, not just the latest. */
  readonly stages: readonly string[]
  readonly percent: number
  readonly errorMessage: string | null
}

const RUN_IDLE: RunSearchStreamState = { status: 'idle', stages: [], percent: 0, errorMessage: null }

/** Streaming counterpart to useRunSearch — same shape as useParseJdStream. */
export function useRunSearchStream() {
  const [state, setState] = useState<RunSearchStreamState>(RUN_IDLE)
  const abortRef = useRef<AbortController | null>(null)

  const start = useCallback(
    (searchId: SearchId, resultsNeeded: number, onSuccess: (outcome: RunSearchOutcome) => void) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState({ status: 'streaming', stages: [], percent: 0, errorMessage: null })

      void (async () => {
        try {
          const stream = runSearchStream(searchId, resultsNeeded, controller.signal)
          let next = await stream.next()
          while (!next.done) {
            const { stage, percent } = next.value
            setState((prev) => ({ ...prev, stages: [...prev.stages, stage], percent }))
            next = await stream.next()
          }
          setState((prev) => ({ ...prev, status: 'success', percent: 100 }))
          onSuccess(next.value)
        } catch (error) {
          if (controller.signal.aborted) return
          setState((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: isApiError(error) ? error.message : 'The search failed. Try again.',
          }))
        }
      })()
    },
    [],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    setState(RUN_IDLE)
  }, [])

  return { ...state, start, reset }
}

export function useSearchResults(searchId: SearchId) {
  return useQuery({
    queryKey: qk.search.results(searchId, null),
    queryFn: ({ signal }) => getSearchResults(searchId, signal),
  })
}

/** Not optimistic: the server assigns the rank, so the list is refetched
 * rather than guessed at. */
export function useAddCandidate(searchId: SearchId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: AddCandidateRequest) => addCandidate(searchId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.search.detail(searchId) }),
  })
}

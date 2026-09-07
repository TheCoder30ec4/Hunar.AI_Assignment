import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'

import { qk } from '@/shared/api/query-keys'
import type { CampaignId } from '@/shared/types/ids'

import { getCampaignCalls, streamBulkCalls } from '../api/calling'

export function useCampaignCalls(campaignId: CampaignId) {
  return useQuery({
    queryKey: [...qk.campaign.detail(campaignId), 'calls'],
    queryFn: ({ signal }) => getCampaignCalls(campaignId, signal),
  })
}

export interface CallingState {
  readonly status: 'idle' | 'running' | 'done' | 'error'
  readonly stage: string | null
  readonly percent: number
  /** Live per-candidate status, keyed by candidateId — merged over the
   * fetched rows so the table updates as calls progress. */
  readonly liveStages: Readonly<Record<string, string>>
  readonly errorMessage: string | null
  readonly warnings: readonly string[]
}

const IDLE: CallingState = {
  status: 'idle',
  stage: null,
  percent: 0,
  liveStages: {},
  errorMessage: null,
  warnings: [],
}

/**
 * Drives the bulk-calling stream. Not TanStack Query: this is a one-shot
 * progress stream with no cacheable server state, and the component needs
 * every intermediate event, which a mutation has no slot for.
 */
export function useBulkCalling(campaignId: CampaignId) {
  const [state, setState] = useState<CallingState>(IDLE)
  const abortRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  const start = useCallback(
    (candidateIds: readonly string[]) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setState({ ...IDLE, status: 'running' })

      void (async () => {
        try {
          for await (const event of streamBulkCalls(campaignId, candidateIds, controller.signal)) {
            if (event.type === 'progress') {
              setState((prev) => ({ ...prev, stage: event.stage, percent: event.percent }))
            } else if (event.type === 'call') {
              setState((prev) => ({
                ...prev,
                liveStages: event.candidate_id
                  ? { ...prev.liveStages, [event.candidate_id]: event.stage ?? event.status }
                  : prev.liveStages,
              }))
              // This call is done — pull its answers/duration in NOW rather
              // than waiting for the rest of the batch to finish.
              if (event.final) {
                void queryClient.invalidateQueries({
                  queryKey: [...qk.campaign.detail(campaignId), 'calls'],
                })
              }
            } else if (event.type === 'transcript') {
              // Transcription lands after the call is already final.
              void queryClient.invalidateQueries({
                queryKey: [...qk.campaign.detail(campaignId), 'calls'],
              })
            } else if (event.type === 'warning') {
              setState((prev) => ({ ...prev, warnings: [...prev.warnings, event.message] }))
            } else {
              setState((prev) => ({ ...prev, status: 'error', errorMessage: event.message }))
              return
            }
          }
          setState((prev) => ({ ...prev, status: 'done', percent: 100 }))
          void queryClient.invalidateQueries({ queryKey: qk.campaign.detail(campaignId) })
        } catch (error) {
          if (controller.signal.aborted) return
          setState((prev) => ({
            ...prev,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Calling failed.',
          }))
        }
      })()
    },
    [campaignId, queryClient],
  )

  const stop = useCallback(() => {
    // Only detaches this browser from the stream — the backend job keeps
    // dialing, since the calls are already placed with the provider.
    abortRef.current?.abort()
    setState(IDLE)
  }, [])

  return { ...state, start, stop }
}

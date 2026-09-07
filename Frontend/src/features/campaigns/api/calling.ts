import { apiFetch } from '@/shared/api/client'
import { readSseStream } from '@/shared/api/sse'
import type { CampaignId } from '@/shared/types/ids'

import {
  callDetailListSchema,
  callDetailSchema,
  callingStreamEventSchema,
  type CallDetail,
  type CallingStreamEvent,
} from '../schemas/calling'

export function getCampaignCalls(campaignId: CampaignId, signal?: AbortSignal): Promise<CallDetail[]> {
  return apiFetch(`/campaigns/${campaignId}/calls`, { schema: callDetailListSchema, signal })
}

export function getCallDetail(
  campaignId: CampaignId,
  candidateId: string,
  signal?: AbortSignal,
): Promise<CallDetail> {
  return apiFetch(`/campaigns/${campaignId}/calls/${candidateId}`, {
    schema: callDetailSchema,
    signal,
  })
}

/**
 * Places bulk calls and yields each real transition. The backend run is a
 * background job — disconnecting stops this stream, not the calls, and
 * re-subscribing replays what was missed.
 */
export async function* streamBulkCalls(
  campaignId: CampaignId,
  candidateIds: readonly string[],
  signal?: AbortSignal,
): AsyncGenerator<CallingStreamEvent, void, void> {
  for await (const raw of readSseStream(
    `/campaigns/${campaignId}/calls/stream`,
    { candidate_ids: candidateIds },
    signal,
  )) {
    const parsed = callingStreamEventSchema.safeParse(raw)
    if (parsed.success) yield parsed.data
  }
}

import { z } from 'zod'

import { apiFetch } from '@/shared/api/client'
import { campaignSchema } from '@/shared/types/domain'
import { asCampaignId, type CampaignId, type SearchId } from '@/shared/types/ids'

import { campaignDetailSchema } from '../schemas/campaign-answers'

const campaignListSchema = z.array(campaignSchema)

export function getCampaigns(signal?: AbortSignal) {
  return apiFetch('/campaigns', { schema: campaignListSchema, signal })
}

export function getCampaign(campaignId: CampaignId, signal?: AbortSignal) {
  return apiFetch(`/campaigns/${campaignId}`, { schema: campaignDetailSchema, signal })
}

const createCampaignResponseSchema = z.object({ campaignId: z.string() })

/** The recruiter's picks become a campaign; the backend's clean check
 * excludes anyone without a phone or email (Backend/services/campaign_service.py). */
export async function createCampaign(
  searchId: SearchId,
  candidateIds: readonly string[],
  signal?: AbortSignal,
): Promise<CampaignId> {
  const response = await apiFetch('/campaigns', {
    method: 'POST',
    body: { search_id: searchId, candidate_ids: candidateIds },
    schema: createCampaignResponseSchema,
    signal,
  })
  return asCampaignId(response.campaignId)
}

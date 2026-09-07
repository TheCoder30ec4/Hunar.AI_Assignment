import { apiFetch } from '@/shared/api/client'
import type { CampaignId } from '@/shared/types/ids'

import { campaignSettingsSchema, type CampaignSettings } from '../schemas/campaign-settings'

export function getCampaignSettings(
  campaignId: CampaignId,
  signal?: AbortSignal,
): Promise<CampaignSettings> {
  return apiFetch(`/campaigns/${campaignId}/settings`, {
    schema: campaignSettingsSchema,
    signal,
  })
}

export function updateCampaignSettings(
  campaignId: CampaignId,
  settings: CampaignSettings,
): Promise<CampaignSettings> {
  return apiFetch(`/campaigns/${campaignId}/settings`, {
    method: 'PUT',
    body: settings,
    schema: campaignSettingsSchema,
  })
}

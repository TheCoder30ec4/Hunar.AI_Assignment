import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from '@/shared/api/query-keys'
import type { CampaignId } from '@/shared/types/ids'

import { getCampaignSettings, updateCampaignSettings } from '../api/campaign-settings'
import type { CampaignSettings } from '../schemas/campaign-settings'

export function useCampaignSettings(campaignId: CampaignId, enabled = true) {
  return useQuery({
    queryKey: qk.settings.campaign(campaignId),
    queryFn: ({ signal }) => getCampaignSettings(campaignId, signal),
    enabled: enabled && campaignId.length > 0,
  })
}

/** Never optimistic: these settings govern when real calls are placed, so
 * the form only reflects what the server confirmed it saved. */
export function useUpdateCampaignSettings(campaignId: CampaignId) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: CampaignSettings) => updateCampaignSettings(campaignId, settings),
    onSuccess: (saved) => {
      queryClient.setQueryData(qk.settings.campaign(campaignId), saved)
    },
  })
}

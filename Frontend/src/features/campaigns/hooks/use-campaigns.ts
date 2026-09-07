import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { qk } from '@/shared/api/query-keys'
import type { CampaignId, SearchId } from '@/shared/types/ids'

import { createCampaign, getCampaign, getCampaigns } from '../api/campaigns'

export function useCampaigns() {
  return useQuery({
    queryKey: qk.campaign.all,
    queryFn: ({ signal }) => getCampaigns(signal),
  })
}

export function useCampaign(campaignId: CampaignId) {
  return useQuery({
    queryKey: qk.campaign.detail(campaignId),
    queryFn: ({ signal }) => getCampaign(campaignId, signal),
  })
}

/** Stage 4: the recruiter's picks become a campaign, ready to call. */
export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ searchId, candidateIds }: { readonly searchId: SearchId; readonly candidateIds: readonly string[] }) =>
      createCampaign(searchId, candidateIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.campaign.all }),
  })
}

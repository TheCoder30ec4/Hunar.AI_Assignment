import type { CampaignId, CandidateId, SearchId } from '@/shared/types/ids'

/**
 * One source of truth for cache keys. Never inline a key array in a component —
 * invalidation depends on these prefixes nesting correctly, and a hand-written
 * array that drifts by one element silently stops matching.
 */
export const qk = {
  search: {
    all: ['search'] as const,
    detail: (id: SearchId) => [...qk.search.all, id] as const,
    results: (id: SearchId, filters: unknown) =>
      [...qk.search.detail(id), 'results', filters] as const,
    providerPlan: (id: SearchId) => [...qk.search.detail(id), 'provider-plan'] as const,
  },
  campaign: {
    all: ['campaign'] as const,
    detail: (id: CampaignId) => [...qk.campaign.all, id] as const,
    answers: (id: CampaignId, filters: unknown) =>
      [...qk.campaign.detail(id), 'answers', filters] as const,
    liveCalls: (id: CampaignId) => [...qk.campaign.detail(id), 'live'] as const,
    funnel: (id: CampaignId) => [...qk.campaign.detail(id), 'funnel'] as const,
  },
  candidate: {
    all: ['candidate'] as const,
    detail: (id: CandidateId) => [...qk.candidate.all, id] as const,
  },
  suppression: {
    all: ['suppression'] as const,
    list: (filters: unknown) => [...qk.suppression.all, 'list', filters] as const,
  },
  settings: {
    all: ['settings'] as const,
    providers: () => [...qk.settings.all, 'providers'] as const,
  },
} as const

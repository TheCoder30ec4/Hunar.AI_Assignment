import { useMutation, useQuery } from '@tanstack/react-query'

import { qk } from '@/shared/api/query-keys'
import type { SearchId } from '@/shared/types/ids'

import { createSearch, getProviderPlan, parseJd, runSearch } from '../api/new-search'
import type { SearchSpec } from '../schemas/search-spec'

/** Stage 1: JD text in, parsed SearchSpec out. Not cached — a re-paste is a fresh parse. */
export function useParseJd() {
  return useMutation({
    mutationFn: (jdText: string) => parseJd(jdText),
  })
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

import { QueryClient } from '@tanstack/react-query'

import { isRetryable } from '@/shared/api/errors'

/** Exponential backoff with jitter, capped at 30s. */
function retryDelay(attemptIndex: number): number {
  const exponential = Math.min(1000 * 2 ** attemptIndex, 30_000)
  // Jitter spreads a thundering herd when several queries fail at once.
  return exponential * (0.5 + Math.random() * 0.5)
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => failureCount < 3 && isRetryable(error),
      retryDelay,

      // DELIBERATE: a recruiter alt-tabbing to check a CV must not re-run a
      // provider search — every refetch spends real credits against PDL /
      // Apollo / Proxycurl / Coresignal. Do not "fix" this to true.
      refetchOnWindowFocus: false,

      // Provider searches take 30s+; treat results as fresh for 5 minutes.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    },
    mutations: {
      retry: false,
    },
  },
})

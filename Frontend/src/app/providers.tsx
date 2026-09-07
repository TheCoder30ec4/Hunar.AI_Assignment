import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Agentation } from 'agentation'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { RouterProvider } from 'react-router'

import { ErrorBoundary } from '@/shared/components/feedback/ErrorBoundary'

import { queryClient } from './query-client'
import { router } from './router'

/**
 * Nesting order is load-bearing:
 *   ErrorBoundary sits OUTSIDE Query so a provider-construction throw is caught.
 *   Router sits INSIDE Query so route loaders can reach the client.
 */
export function Providers() {
  return (
    <ErrorBoundary label="The application">
      <QueryClientProvider client={queryClient}>
        <TooltipPrimitive.Provider delayDuration={200}>
          <RouterProvider router={router} />
        </TooltipPrimitive.Provider>
        {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
        {/* Click-to-annotate feedback toolbar; syncs to a coding agent via
            agentation-mcp when that's configured. Dev-only, same gate as
            the Query devtools above. */}
        {import.meta.env.DEV ? <Agentation /> : null}
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

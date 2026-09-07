import { createBrowserRouter, Navigate } from 'react-router'

import { AppShell } from '@/shared/components/layout/AppShell'
import { RequireAuth } from '@/shared/components/layout/RequireAuth'
import { RouteErrorBoundary } from '@/shared/components/feedback/ErrorBoundary'

/**
 * React Router v7 in LIBRARY mode — createBrowserRouter, no routes.ts and no
 * framework plugin. The docs interleave both modes; mixing them produces
 * confusing build errors.
 *
 * Everything is lazy except the shell itself.
 */
export const router = createBrowserRouter([
  {
    path: 'login',
    errorElement: <RouteErrorBoundary />,
    lazy: async () => {
      const { LoginPage } = await import('@/features/auth/routes/LoginPage')
      return { Component: LoginPage }
    },
  },
  {
    // RequireAuth gates everything below on a valid token before the shell
    // (or the review gate, which sits alongside it) ever renders.
    element: <RequireAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        // Pathless layout route: everything under here renders inside the shell.
        element: <AppShell />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, element: <Navigate to="/campaigns" replace /> },
          {
            path: 'searches/new',
            errorElement: <RouteErrorBoundary />,
            lazy: async () => {
              const { NewSearchPage } = await import('@/features/search/routes/NewSearchPage')
              return { Component: NewSearchPage }
            },
          },
          {
            path: 'searches/:searchId',
            errorElement: <RouteErrorBoundary />,
            lazy: async () => {
              const { SearchResultsPage } = await import(
                '@/features/search/routes/SearchResultsPage'
              )
              return { Component: SearchResultsPage }
            },
            children: [
              {
                // Candidate detail is a NESTED ROUTE, never local state: the URL is
                // shareable and browser-back closes the pane.
                path: 'c/:candidateId',
                errorElement: <RouteErrorBoundary />,
                lazy: async () => {
                  const { CandidateDetailPane } = await import(
                    '@/features/candidates/routes/CandidateDetailPane'
                  )
                  return { Component: CandidateDetailPane }
                },
              },
            ],
          },
          {
            path: 'campaigns',
            errorElement: <RouteErrorBoundary />,
            lazy: async () => {
              const { CampaignListPage } = await import(
                '@/features/campaigns/routes/CampaignListPage'
              )
              return { Component: CampaignListPage }
            },
          },
          {
            path: 'campaigns/:campaignId',
            errorElement: <RouteErrorBoundary />,
            lazy: async () => {
              const { CampaignDashboardPage } = await import(
                '@/features/campaigns/routes/CampaignDashboardPage'
              )
              return { Component: CampaignDashboardPage }
            },
            children: [
              {
                path: 'c/:candidateId',
                errorElement: <RouteErrorBoundary />,
                lazy: async () => {
                  const { CallDetailDrawer } = await import(
                    '@/features/calls/routes/CallDetailDrawer'
                  )
                  return { Component: CallDetailDrawer }
                },
              },
            ],
          },
          {
            path: 'suppression',
            errorElement: <RouteErrorBoundary />,
            lazy: async () => {
              const { SuppressionPage } = await import(
                '@/features/compliance/routes/SuppressionPage'
              )
              return { Component: SuppressionPage }
            },
          },
          {
            path: 'settings',
            errorElement: <RouteErrorBoundary />,
            lazy: async () => {
              const { SettingsPage } = await import('@/features/settings/routes/SettingsPage')
              return { Component: SettingsPage }
            },
          },
        ],
      },
      {
        /* The compliance gate is full-width with no shell panes, so it is declared a
           SIBLING of the layout route rather than a child. Structuring it any other
           way means fighting the shell with CSS forever. Still a child of RequireAuth —
           this screen is as sensitive as anything inside the shell. */
        path: 'campaigns/:campaignId/review',
        errorElement: <RouteErrorBoundary />,
        lazy: async () => {
          const { ComplianceReviewPage } = await import(
            '@/features/compliance/routes/ComplianceReviewPage'
          )
          return { Component: ComplianceReviewPage }
        },
      },
    ],
  },
  {
    // Public: a wrong URL shouldn't force an unauthenticated visitor through
    // a login redirect just to see "page not found".
    path: '*',
    lazy: async () => {
      const { NotFoundPage } = await import('@/app/NotFoundPage')
      return { Component: NotFoundPage }
    },
  },
])

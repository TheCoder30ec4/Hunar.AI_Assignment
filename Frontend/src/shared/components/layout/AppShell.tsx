import { Suspense } from 'react'
import { Outlet } from 'react-router'

import { ErrorBoundary } from '@/shared/components/feedback/ErrorBoundary'

import { NavRail } from './NavRail'

/**
 * NavRail is the one piece of chrome every screen shares. TopBar varies
 * per-page (title, breadcrumb, page-specific actions) so each route renders
 * its own — see TopBar.tsx.
 */
export function AppShell() {
  return (
    <div className="grid h-dvh grid-cols-[auto_1fr] bg-[var(--color-bg)]">
      <NavRail />

      {/* Boundary sits inside the shell so a failed route keeps the nav usable. */}
      <div className="grid min-h-0 grid-rows-[1fr]">
        <ErrorBoundary label="This view">
          <Suspense fallback={<ShellFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  )
}

function ShellFallback() {
  return (
    <div className="p-4 text-[13px] text-[var(--color-ink-muted)]" aria-busy="true">
      Loading…
    </div>
  )
}

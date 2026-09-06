import { Suspense } from 'react'
import { NavLink, Outlet } from 'react-router'

import { ErrorBoundary } from '@/shared/components/feedback/ErrorBoundary'
import { cn } from '@/shared/lib/cn'

/**
 * Phase 1: a working shell so every route is reachable and provably renders.
 * Phase 2 replaces the nav and top bar with NavRail / TopBar / LiveStrip and
 * adds ThreePane.
 */

const NAV_LINKS = [
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/searches/new', label: 'New search' },
  { to: '/suppression', label: 'Suppression' },
  { to: '/settings/providers', label: 'Settings' },
] as const

export function AppShell() {
  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] bg-[var(--color-bg)]">
      <header className="flex h-10 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-3">
        <span className="text-[13px] font-semibold text-[var(--color-ink)]">
          People search
        </span>
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  'rounded-[var(--radius-control)] px-2 py-1 text-[13px]',
                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
                  isActive
                    ? 'bg-[var(--color-surface-sunk)] font-medium text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunk)]',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Boundary sits inside the shell so a failed route keeps the nav usable. */}
      <main className="min-h-0 overflow-auto">
        <ErrorBoundary label="This view">
          <Suspense fallback={<ShellFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
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

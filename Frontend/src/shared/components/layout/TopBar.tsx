import type { ReactNode } from 'react'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

/**
 * Page title + command palette trigger + credit balance + the global
 * pause/resume calling control. One instance per screen (via `title`/
 * `breadcrumb`), not per-route boilerplate — screens pass what's specific,
 * the chrome around it stays identical everywhere.
 */
export function TopBar({
  title,
  breadcrumb,
  creditsBalance,
  callingPaused = false,
  onToggleCalling,
}: {
  readonly title: string
  readonly breadcrumb?: string | undefined
  readonly creditsBalance: number
  readonly callingPaused?: boolean | undefined
  readonly onToggleCalling?: (() => void) | undefined
}): ReactNode {
  return (
    <header className="flex h-12 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[15px] font-semibold text-[var(--color-ink)]">{title}</h1>
        {breadcrumb ? (
          <span className="truncate text-[13px] text-[var(--color-ink-muted)]">{breadcrumb}</span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="relative">
          <Input
            type="search"
            placeholder="Search or run a command"
            aria-label="Search or run a command"
            className="w-64 pr-14"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[var(--color-line)] bg-[var(--color-surface-sunk)] px-1.5 py-0.5 text-[11px] text-[var(--color-ink-muted)]">
            ⌘K
          </kbd>
        </div>

        <div className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink-muted)]">
          <span>Credits</span>
          <span className="machine font-medium text-[var(--color-ink)]">
            {creditsBalance.toLocaleString('en-IN')}
          </span>
        </div>

        <Button type="button" variant="primary" size="sm" onClick={onToggleCalling}>
          {callingPaused ? 'Resume calling' : 'Pause calling'}
        </Button>
      </div>
    </header>
  )
}

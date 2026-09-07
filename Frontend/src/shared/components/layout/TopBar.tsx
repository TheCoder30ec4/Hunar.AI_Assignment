import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Button, buttonVariants } from '@/shared/components/ui/button'

/**
 * Page title + an optional primary action. One instance per screen (via
 * `title`/`breadcrumb`/`action`), not per-route boilerplate — screens pass
 * what's specific, the chrome around it stays identical everywhere.
 *
 * Deliberately minimal: no credit balance (spend belongs on the provider
 * plan, where it's actionable) and no command-palette input — there is no
 * command palette, and a search box that searches nothing is worse than
 * none at all.
 */
export function TopBar({
  title,
  breadcrumb,
  action,
}: {
  readonly title: string
  readonly breadcrumb?: string | undefined
  readonly action?: TopBarAction | undefined
}): ReactNode {
  return (
    <header className="flex h-12 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[15px] font-semibold text-[var(--color-ink)]">{title}</h1>
        {breadcrumb ? (
          <span className="truncate text-[13px] text-[var(--color-ink-muted)]">{breadcrumb}</span>
        ) : null}
      </div>

      {action ? (
        <div className="ml-auto flex items-center gap-3">
          <TopBarActionButton action={action} />
        </div>
      ) : null}
    </header>
  )
}

/**
 * Either a navigation (`to`) or a handler (`onClick`) — a real link renders
 * as an anchor so browser navigation (open in new tab, etc.) keeps working.
 */
export type TopBarAction =
  | { readonly label: string; readonly to: string; readonly disabled?: undefined; readonly title?: undefined }
  | {
      readonly label: string
      readonly onClick: () => void
      readonly disabled?: boolean | undefined
      readonly title?: string | undefined
    }

function TopBarActionButton({ action }: { readonly action: TopBarAction }) {
  if ('to' in action) {
    return (
      <Link to={action.to} className={buttonVariants({ variant: 'primary', size: 'sm' })}>
        {action.label}
      </Link>
    )
  }
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
    >
      {action.label}
    </Button>
  )
}

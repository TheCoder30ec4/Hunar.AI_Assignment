import type { ReactNode } from 'react'

/**
 * A layout slot, not a filter implementation — what a filter pill means is
 * entirely screen-specific (a campaign funnel segment, a suppression
 * reason, a call status). Each screen builds its own pills and passes them
 * as children here for consistent toolbar spacing.
 */
export function FilterPills({ children }: { readonly children: ReactNode }) {
  return <div className="flex items-center gap-1.5">{children}</div>
}

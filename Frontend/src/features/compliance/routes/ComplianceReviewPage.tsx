import { Link, useParams } from 'react-router'

/**
 * Full-width gate: declared as a sibling of the shell layout route, so there are
 * no nav panes around it.
 *
 * NON-NEGOTIABLE: this screen has no override control. Not a button, not a
 * confirm dialog, not a keyboard shortcut. Do not add one.
 */
export function ComplianceReviewPage() {
  const { campaignId } = useParams()

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] p-6">
      <h1 className="text-[15px] font-semibold text-[var(--color-ink)]">
        Compliance review — {campaignId ?? 'unknown'}
      </h1>
      <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
        Built in phase 9. Full-width, outside the shell.
      </p>
      <Link
        to={`/campaigns/${campaignId ?? ''}`}
        className="mt-3 inline-block text-[13px] text-[var(--color-accent)] underline-offset-4 hover:underline"
      >
        Back to campaign
      </Link>
    </div>
  )
}

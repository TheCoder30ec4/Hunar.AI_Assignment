import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="min-h-dvh bg-[var(--color-bg)] p-6">
      <h1 className="text-[15px] font-semibold text-[var(--color-ink)]">Page not found</h1>
      <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
        That URL does not match any screen in this console.
      </p>
      <Link
        to="/campaigns"
        className="mt-3 inline-block text-[13px] text-[var(--color-accent)] underline-offset-4 hover:underline"
      >
        Go to campaigns
      </Link>
    </div>
  )
}

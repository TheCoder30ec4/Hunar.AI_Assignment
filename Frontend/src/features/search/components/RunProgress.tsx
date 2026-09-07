import { Button } from '@/shared/components/ui/button'

import type { RunSearchStreamState } from '../hooks/use-new-search'

/**
 * The stages here are REAL pipeline steps streamed from the backend
 * (Apify search → role extraction → save → Apollo contacts → rank → campaign),
 * unlike the parse-jd bar whose stages are scripted. Completed stages stay
 * on screen as a log so the recruiter sees what actually happened, not just
 * a bar that moved.
 */
export function RunProgress({
  state,
  onRetry,
}: {
  readonly state: RunSearchStreamState
  readonly onRetry: () => void
}) {
  const current = state.stages.at(-1)

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">Running search</h2>
        <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
          This spends real provider credits — leave this tab open until it finishes.
        </p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={state.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Search progress"
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunk)]"
      >
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${String(state.percent)}%` }}
        />
      </div>

      <ol className="flex flex-col gap-1.5 text-[13px]">
        {state.stages.map((stage, index) => {
          const isCurrent = index === state.stages.length - 1 && state.status === 'streaming'
          return (
            <li key={`${String(index)}-${stage}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={
                  isCurrent
                    ? 'size-2 shrink-0 animate-pulse rounded-full bg-[var(--color-accent)]'
                    : 'size-2 shrink-0 rounded-full bg-[var(--color-sig-good)]'
                }
              />
              <span className={isCurrent ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'}>
                {stage}
              </span>
            </li>
          )
        })}
        {state.status === 'streaming' && !current ? (
          <li className="text-[var(--color-ink-muted)]">Starting…</li>
        ) : null}
      </ol>

      {state.status === 'error' ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-[13px]">
          <p className="text-[var(--color-sig-bad)]">{state.errorMessage}</p>
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Back to provider plan
          </Button>
        </div>
      ) : null}

      {state.status === 'success' ? (
        <p className="text-[13px] text-[var(--color-sig-good)]">Done — opening the results…</p>
      ) : null}
    </div>
  )
}

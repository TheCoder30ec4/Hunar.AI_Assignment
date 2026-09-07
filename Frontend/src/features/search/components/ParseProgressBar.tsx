/**
 * The stage label and percent are fabricated on the backend (the parse is
 * one LLM call with no real sub-steps) — this bar exists so the ~2-3s wait
 * isn't a blank screen, not to report literal internal state.
 */
export function ParseProgressBar({
  stage,
  percent,
}: {
  readonly stage: string | null
  readonly percent: number
}) {
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Parsing job description"
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-sunk)]"
      >
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <p className="text-[12px] text-[var(--color-ink-muted)]">{stage ?? 'Starting…'}</p>
    </div>
  )
}

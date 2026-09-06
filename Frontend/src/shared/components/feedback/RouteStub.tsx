import type { ReactNode } from 'react'

/**
 * Phase 1 placeholder. Every route renders one of these so routing is provably
 * complete before any screen exists; each is replaced in its own phase.
 */
export function RouteStub({
  title,
  phase,
  children,
}: {
  readonly title: string
  readonly phase: string
  readonly children?: ReactNode | undefined
}) {
  return (
    <section className="p-4">
      <h1 className="text-[15px] font-semibold text-[var(--color-ink)]">{title}</h1>
      <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">Built in {phase}.</p>
      {children}
    </section>
  )
}

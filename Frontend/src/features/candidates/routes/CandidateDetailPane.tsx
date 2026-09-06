import { useParams } from 'react-router'

export function CandidateDetailPane() {
  const { candidateId } = useParams()

  return (
    <aside className="mt-3 border-t border-[var(--color-line)] pt-3 text-[13px]">
      <p className="font-medium text-[var(--color-ink)]">
        Candidate detail — {candidateId ?? 'unknown'}
      </p>
      <p className="text-[var(--color-ink-muted)]">
        Built in phase 5. Nested route: this URL is shareable and back closes the pane.
      </p>
    </aside>
  )
}

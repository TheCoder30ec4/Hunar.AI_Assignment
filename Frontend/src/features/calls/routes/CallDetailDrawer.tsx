import { useParams } from 'react-router'

export function CallDetailDrawer() {
  const { candidateId } = useParams()

  return (
    <aside className="mt-3 border-t border-[var(--color-line)] pt-3 text-[13px]">
      <p className="font-medium text-[var(--color-ink)]">
        Call detail — {candidateId ?? 'unknown'}
      </p>
      <p className="text-[var(--color-ink-muted)]">
        Built in phase 8: waveform, synced transcript, editable answers.
      </p>
    </aside>
  )
}

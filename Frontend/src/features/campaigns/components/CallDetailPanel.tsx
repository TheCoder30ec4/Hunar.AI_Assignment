import { useEffect, useMemo, useRef, useState } from 'react'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { formatPhone } from '@/shared/lib/format'

import { CALL_STAGE_TONE, type CallDetail } from '../schemas/calling'

/**
 * The answers the recruiter reads first, in reading order. Keys match the
 * voice agent's own result_schema (Backend/core/agent_prompt.py) — adding a
 * key there and here is all it takes to surface a new answer.
 *
 * Deliberately NOT shown: a per-answer confidence score. Hunar returns flat
 * key/value answers with no confidence attached (confirmed against the live
 * API), and a fabricated number is worse than none — a recruiter would act
 * on it.
 */
const PRIMARY_KEYS = [
  'interest_level',
  'requirements',
  'notice_period',
  'expected_ctc',
  'open_to_relocating',
  'skill_match',
  'experience_years',
  'technical_skills',
  'current_location',
  'best_time_to_talk',
] as const

const KEY_LABEL: Readonly<Record<string, string>> = {
  interested: 'Interested',
  interest_level: 'Interest',
  requirements: 'What they need',
  notice_period: 'Notice period',
  expected_ctc: 'Expected compensation',
  open_to_relocating: 'Open to relocating',
  skill_match: 'Skill match',
  experience_years: 'Experience',
  technical_skills: 'Skills',
  current_location: 'Current location',
  best_time_to_talk: 'Best time to talk',
  not_interested_reason: 'Reason not interested',
  recommendation: 'Recommendation',
  summary: 'Summary',
  call_completed: 'Call completed',
}

function formatClock(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  return `${String(mins)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

/**
 * A deterministic bar pattern derived from the call id, NOT real audio
 * amplitude — decoding the .wav to draw a true waveform would download
 * megabytes per row just for decoration. Same id always draws the same
 * shape, so it reads as a stable visual rather than random noise, and the
 * playhead over it is real.
 */
function useBars(seed: string, count: number): number[] {
  return useMemo(() => {
    let hash = 0
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0
    return Array.from({ length: count }, () => {
      hash = (hash * 1103515245 + 12345) & 0x7fffffff
      return 0.35 + ((hash >> 8) % 1000) / 1000 * 0.65
    })
  }, [seed, count])
}

export function CallDetailPanel({
  call,
  onClose,
}: {
  readonly call: CallDetail
  readonly onClose: () => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentMs, setCurrentMs] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const bars = useBars(call.attemptId, 44)

  const durationMs = (call.durationSecs ?? 0) * 1000
  const progress = durationMs > 0 ? Math.min(currentMs / durationMs, 1) : 0

  const byKey = new Map(call.answers.map((a) => [a.key, a.value]))
  const known = (key: string): string | undefined => {
    const value = byKey.get(key)
    return value && value.toLowerCase() !== 'unknown' ? value : undefined
  }

  const primary = PRIMARY_KEYS.filter((key) => known(key))
  const summary = known('summary')
  const notInterestedReason = known('not_interested_reason')
  const shown = new Set<string>([...primary, 'summary', 'not_interested_reason', 'interested'])
  const other = call.answers.filter(
    (a) => !shown.has(a.key) && a.value.toLowerCase() !== 'unknown',
  )

  const interested = known('interested')?.toLowerCase()
  const stageTone = CALL_STAGE_TONE[call.stage] ?? CALL_STAGE_TONE[call.status]

  // The headline verdict: interest is the call's whole purpose, so it leads.
  const verdict =
    interested === 'yes'
      ? { tone: 'good' as const, label: 'interested' }
      : interested === 'no'
        ? { tone: 'bad' as const, label: 'not interested' }
        : stageTone && stageTone.tone !== 'neutral'
          ? { tone: stageTone.tone, label: stageTone.label }
          : null

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onPause)
    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onPause)
    }
  }, [call.attemptId])

  const seekTo = (ms: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = ms / 1000
    void audio.play()
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play()
    else audio.pause()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b border-[var(--color-line)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-[var(--color-ink)]">
            {call.candidateName}
          </h2>
          <p className="mt-0.5 text-[13px] text-[var(--color-ink-muted)]">
            {[
              call.title,
              call.company,
              call.durationSecs !== null ? `${formatClock(call.durationSecs)} call` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {verdict ? <Badge variant={verdict.tone}>{verdict.label}</Badge> : null}
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled
          title="Interview scheduling isn't built yet."
        >
          Book interview
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Esc
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {call.recordingUrl ? (
          <div className="mb-5 rounded-[var(--radius-control)] border border-[var(--color-line)] p-3">
            <audio
              ref={audioRef}
              src={call.recordingUrl}
              preload="metadata"
              className="sr-only"
              onTimeUpdate={(event) => setCurrentMs(event.currentTarget.currentTime * 1000)}
            >
              <track kind="captions" />
            </audio>

            {/* Clicking the bars seeks; the played portion is filled. */}
            <button
              type="button"
              aria-label="Seek within the recording"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                const ratio = (event.clientX - rect.left) / rect.width
                seekTo(ratio * durationMs)
              }}
              className="flex h-20 w-full items-center gap-[3px] rounded px-1 focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
            >
              {bars.map((height, index) => (
                <span
                  key={index}
                  style={{ height: `${String(height * 100)}%` }}
                  className={
                    index / bars.length <= progress
                      ? 'flex-1 rounded-[1px] bg-[var(--color-accent)]'
                      : 'flex-1 rounded-[1px] bg-[var(--color-surface-sunk)]'
                  }
                />
              ))}
            </button>

            {/* Ticks mark where each answer's transcript moment sits. */}
            {call.transcript.length > 0 && durationMs > 0 ? (
              <div className="relative mt-1 h-3">
                {call.transcript.map((segment, index) => (
                  <span
                    key={`${String(segment.startMs)}-${String(index)}`}
                    aria-hidden="true"
                    style={{ left: `${String((segment.startMs / durationMs) * 100)}%` }}
                    className="absolute top-0 h-2 w-px bg-[var(--color-ink-muted)]"
                  />
                ))}
              </div>
            ) : null}

            <div className="mt-2 flex items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={togglePlay}>
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <span className="machine text-[13px] text-[var(--color-ink)]">
                {formatClock(currentMs / 1000)} / {formatClock(call.durationSecs ?? 0)}
              </span>
              <span className="text-[12px] text-[var(--color-ink-muted)]">
                Ticks mark each spoken turn
              </span>
            </div>
          </div>
        ) : (
          <p className="mb-5 text-[13px] text-[var(--color-ink-muted)]">
            No recording — the call did not connect.
          </p>
        )}

        {primary.length > 0 ? (
          <>
            <h3 className="mb-2 text-[13px] text-[var(--color-ink-muted)]">
              Answers — extracted by the voice agent
            </h3>
            <div className="mb-5 divide-y divide-[var(--color-line)] rounded-[var(--radius-control)] border border-[var(--color-line)]">
              {primary.map((key) => (
                <div key={key} className="flex items-baseline gap-3 px-3 py-2.5">
                  <span className="w-44 shrink-0 text-[13px] text-[var(--color-ink-muted)]">
                    {KEY_LABEL[key] ?? key}
                  </span>
                  <span className="flex-1 text-[14px] text-[var(--color-ink)]">{known(key)}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {notInterestedReason ? (
          <div className="mb-5">
            <h3 className="mb-1 text-[13px] text-[var(--color-ink-muted)]">
              Why they weren&apos;t interested
            </h3>
            <p className="text-[14px] text-[var(--color-ink)]">{notInterestedReason}</p>
          </div>
        ) : null}

        {summary ? (
          <div className="mb-5">
            <h3 className="mb-1 text-[13px] text-[var(--color-ink-muted)]">Summary</h3>
            <p className="text-[14px] text-[var(--color-ink)]">{summary}</p>
          </div>
        ) : null}

        {other.length > 0 ? (
          <details className="mb-5 text-[13px]">
            <summary className="cursor-pointer text-[var(--color-ink-muted)]">
              Other answers ({other.length})
            </summary>
            <div className="mt-1.5 flex flex-col gap-1">
              {other.map((a) => (
                <div key={a.key} className="flex gap-3">
                  <span className="w-44 shrink-0 text-[var(--color-ink-muted)]">
                    {KEY_LABEL[a.key] ?? a.key}
                  </span>
                  <span className="text-[var(--color-ink)]">{a.value}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}

        <h3 className="mb-2 text-[13px] text-[var(--color-ink-muted)]">Transcript</h3>
        {call.transcript.length > 0 ? (
          <ol className="flex flex-col">
            {call.transcript.map((segment, index) => {
              const playing = currentMs >= segment.startMs && currentMs < segment.endMs
              return (
                <li key={`${String(segment.startMs)}-${String(index)}`}>
                  <button
                    type="button"
                    onClick={() => seekTo(segment.startMs)}
                    className={[
                      'flex w-full items-start gap-3 rounded-[var(--radius-control)] px-2 py-1.5 text-left',
                      'hover:bg-[var(--color-surface-sunk)]',
                      'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]',
                      playing ? 'bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]' : '',
                    ].join(' ')}
                  >
                    <span className="w-20 shrink-0 text-[13px] text-[var(--color-ink-muted)]">
                      {segment.speaker === 'candidate' ? call.candidateName.split(' ')[0] : 'agent'}
                    </span>
                    <span className="flex-1 text-[14px] text-[var(--color-ink)]">{segment.text}</span>
                    <span className="machine w-10 shrink-0 text-right text-[12px] text-[var(--color-ink-muted)]">
                      {formatClock(segment.startMs / 1000)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            {call.recordingUrl ? 'Transcribing…' : 'No transcript — the call produced no recording.'}
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-[var(--color-line)] px-5 py-3">
        {/* Disabled until the review/redial actions have somewhere to write —
            a button that silently does nothing is worse than one marked off. */}
        <Button type="button" variant="secondary" disabled title="Not built yet.">
          Mark qualified
        </Button>
        <Button type="button" variant="secondary" disabled title="Not built yet.">
          Mark not a fit
        </Button>
        <Button type="button" variant="secondary" disabled title="Not built yet.">
          Call again
        </Button>
        {call.phone ? (
          <span className="machine ml-auto text-[12px] text-[var(--color-ink-muted)]">
            {formatPhone(call.phone)}
          </span>
        ) : null}
      </footer>
    </div>
  )
}

import { Badge } from '@/shared/components/ui/badge'
import { formatPhone } from '@/shared/lib/format'

/** The fields both the results page and the campaign page show on click.
 * Shape is the intersection of their row types, not a shared schema — the
 * two pages have genuinely different wire formats (snake vs camel case). */
export interface CandidateDetailData {
  readonly name: string
  readonly title: string
  readonly company: string
  readonly location: string
  readonly phone: string | null
  readonly email: string | null
  readonly linkedinUrl: string | null
  readonly matchedKeywords: readonly string[]
  readonly source: string
}

export const SOURCE_LABEL: Readonly<Record<string, string>> = {
  apify: 'LinkedIn (Apify)',
  seed: 'Saved contact',
  manual: 'Added manually',
}

export function CandidateDetailPane({ candidate }: { readonly candidate: CandidateDetailData }) {
  const hasContact = Boolean(candidate.phone || candidate.email)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-[16px] font-semibold text-[var(--color-ink)]">{candidate.name}</h2>
          <Badge withDot={false} className="text-[10px]">
            {SOURCE_LABEL[candidate.source] ?? candidate.source}
          </Badge>
        </div>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          {[candidate.title, candidate.company, candidate.location].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-[var(--color-line)] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-medium text-[var(--color-ink-muted)]">Contact</h3>
          <Badge variant={hasContact ? 'good' : 'bad'}>{hasContact ? 'Callable' : 'No contact info'}</Badge>
        </div>
        <DetailField label="Phone" value={candidate.phone ? formatPhone(candidate.phone) : null} />
        <DetailField label="Email" value={candidate.email} />
        {candidate.linkedinUrl ? (
          <a
            href={candidate.linkedinUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            LinkedIn profile
          </a>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-[12px] font-medium text-[var(--color-ink-muted)]">Why this ranked here</h3>
        {candidate.matchedKeywords.length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-[13px] text-[var(--color-ink)]">
            {candidate.matchedKeywords.map((keyword) => (
              <li key={keyword} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-[var(--color-accent)]" />
                <span>{keyword} appears in this candidate's profile</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[var(--color-ink-muted)]">
            No JD keywords matched this candidate's profile text.
          </p>
        )}
      </div>
    </div>
  )
}

function DetailField({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-ink-muted)]">{label}</p>
      <p className="machine text-[13px] text-[var(--color-ink)]">{value ?? 'Not available'}</p>
    </div>
  )
}

import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { Outlet, useParams } from 'react-router'

import { CandidateDetailPane, SOURCE_LABEL } from '@/features/candidates/components/CandidateDetailPane'
import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { TopBar } from '@/shared/components/layout/TopBar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { DataTable } from '@/shared/components/data-table/DataTable'
import { useCandidateTable } from '@/shared/components/data-table/useCandidateTable'
import { CAMPAIGN_STATUS_TONE } from '@/shared/types/domain'
import { asCampaignId } from '@/shared/types/ids'

import { useCampaign } from '../hooks/use-campaigns'
import type { CampaignCandidateRow } from '../schemas/campaign-answers'

/** id is candidateId — useCandidateTable requires a stable `id` field, and
 * the wire shape names it candidateId (it's a candidate, not a campaign row). */
type Row = CampaignCandidateRow & { readonly id: string }

/** Column widths sum to <=900px deliberately — the table pane sits next to
 * a fixed 384px detail panel, so this has to fit real narrow-viewport widths
 * without relying on horizontal scroll to reach the last column. */
const COLUMNS: ColumnDef<Row, never>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    size: 160,
    cell: ({ row }) => <span className="font-medium text-[var(--color-ink)]">{row.original.name}</span>,
  },
  { accessorKey: 'title', header: 'Title', size: 180 },
  { accessorKey: 'company', header: 'Company', size: 130 },
  { accessorKey: 'location', header: 'Location', size: 100 },
  {
    accessorKey: 'matchScore',
    header: 'Match',
    size: 110,
    cell: ({ row }) => <MatchScoreCell score={row.original.matchScore} />,
  },
  {
    accessorKey: 'source',
    header: 'Source',
    size: 110,
    cell: ({ row }) => (
      <Badge withDot={false} className="text-[10px]">
        {SOURCE_LABEL[row.original.source] ?? row.original.source}
      </Badge>
    ),
  },
  {
    accessorKey: 'stage',
    header: 'Stage',
    size: 90,
    cell: ({ row }) => (
      <Badge withDot={false} className="text-[10px]">
        {row.original.stage === 'queued' ? 'Queued' : row.original.stage}
      </Badge>
    ),
  },
  {
    id: 'contact',
    header: 'Contact',
    size: 100,
    cell: ({ row }) => {
      const { phone, email } = row.original
      if (!phone && !email) return <span className="text-[var(--color-ink-muted)]">—</span>
      return <span>{phone && email ? 'phone + email' : phone ? 'phone' : 'email'}</span>
    },
  },
]

export function CampaignDashboardPage() {
  const { campaignId: campaignIdParam } = useParams()
  const campaignId = asCampaignId(campaignIdParam ?? '')
  const campaign = useCampaign(campaignId)
  const [sorting, setSorting] = useState<{ id: string; desc: boolean }[]>([
    { id: 'matchScore', desc: true },
  ])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // The table is the calling list: only rows that passed the clean check.
  // Excluded picks are listed separately below so nothing silently vanishes.
  const rows: Row[] = useMemo(
    () =>
      (campaign.data?.candidates ?? [])
        .filter((c) => c.stage !== 'excluded')
        .map((c) => ({ ...c, id: c.candidateId })),
    [campaign.data],
  )
  const excluded = campaign.data?.candidates.filter((c) => c.stage === 'excluded') ?? []

  const table = useCandidateTable({
    data: rows,
    columns: COLUMNS,
    sorting,
    onSortingChange: setSorting,
  })

  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar
        title={campaign.data?.name ?? 'Campaign'}
        breadcrumb={campaign.data ? `${String(campaign.data.candidateCount)} callable` : undefined}
        creditsBalance={8420}
        // No dialer exists yet — every candidate stays queued, so pausing
        // calling has nothing to pause. Disabled rather than hidden: the
        // control's eventual presence is real, its function isn't yet.
        callingControlDisabled
      />

      <div className="flex h-full min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col border-r border-[var(--color-line)]">
          {campaign.isPending ? (
            <div className="flex flex-col gap-2 p-4" aria-busy="true">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : null}

          {campaign.isError ? (
            <div role="alert" className="p-4 text-[13px]">
              <p className="text-[var(--color-sig-bad)]">Could not load this campaign.</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => void campaign.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}

          {campaign.data ? (
            <>
              <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-2 text-[13px]">
                <span className="font-medium text-[var(--color-ink)]">
                  {campaign.data.candidateCount} callable
                </span>
                {excluded.length > 0 ? (
                  <span className="text-[var(--color-ink-muted)]">
                    · {excluded.length} excluded (no contact info)
                  </span>
                ) : null}
                <Badge variant={CAMPAIGN_STATUS_TONE[campaign.data.status as keyof typeof CAMPAIGN_STATUS_TONE]?.tone ?? 'neutral'}>
                  {CAMPAIGN_STATUS_TONE[campaign.data.status as keyof typeof CAMPAIGN_STATUS_TONE]?.label ??
                    campaign.data.status}
                </Badge>
              </div>

              {campaign.data.contactNote ? (
                <p
                  role="status"
                  className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunk)] px-4 py-2 text-[12px] text-[var(--color-ink-muted)]"
                >
                  {campaign.data.contactNote}
                </p>
              ) : null}

              <DataTable table={table}>
                {rows.length === 0 ? (
                  <DataTable.EmptyState>
                    <p className="text-[13px] text-[var(--color-ink-muted)]">
                      Nobody in this campaign has contact info to call.
                    </p>
                  </DataTable.EmptyState>
                ) : (
                  <DataTable.Virtualised
                    estimateSize={40}
                    activeRowId={selected?.id ?? null}
                    onRowClick={(rowId) => setSelectedId(rowId)}
                  />
                )}
              </DataTable>

              {excluded.length > 0 ? (
                <details className="border-t border-[var(--color-line)] px-4 py-2 text-[12px]">
                  <summary className="cursor-pointer text-[var(--color-ink-muted)]">
                    Excluded by the clean check — no phone or email ({excluded.length})
                  </summary>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {excluded.map((c) => (
                      <li key={c.candidateId} className="flex items-center gap-2 text-[var(--color-ink)]">
                        <span className="font-medium">{c.name}</span>
                        <span className="text-[var(--color-ink-muted)]">
                          {[c.title, c.company].filter(Boolean).join(' · ')}
                        </span>
                        <Badge withDot={false} className="text-[10px]">
                          {SOURCE_LABEL[c.source] ?? c.source}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="w-96 shrink-0 overflow-auto p-5">
          {selected ? (
            <>
              <CandidateDetailPane key={selected.id} candidate={selected} />
              <Button type="button" variant="primary" className="mt-5 w-full" disabled title="No calling pipeline yet.">
                Call now
              </Button>
            </>
          ) : (
            <p className="text-[13px] text-[var(--color-ink-muted)]">Select a candidate to see details.</p>
          )}
        </div>
      </div>

      {/* Call detail drawer renders here as a nested route. */}
      <Outlet />
    </div>
  )
}

function MatchScoreCell({ score }: { readonly score: number }) {
  const pct = Math.round(score * 100)
  const filled = Math.round(score * 5)
  return (
    <span className="machine flex items-center gap-2">
      <span className="tabular-nums">{pct}</span>
      <span aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={
              i < filled
                ? 'h-2.5 w-2.5 rounded-[2px] bg-[var(--color-accent)]'
                : 'h-2.5 w-2.5 rounded-[2px] bg-[var(--color-surface-sunk)]'
            }
          />
        ))}
      </span>
    </span>
  )
}

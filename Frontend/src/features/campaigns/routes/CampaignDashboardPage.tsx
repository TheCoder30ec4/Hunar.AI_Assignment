import type { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'

import { DataTable } from '@/shared/components/data-table/DataTable'
import { useCandidateTable } from '@/shared/components/data-table/useCandidateTable'
import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { TopBar } from '@/shared/components/layout/TopBar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { asCampaignId } from '@/shared/types/ids'

import { CallDetailPanel } from '../components/CallDetailPanel'
import { useBulkCalling, useCampaignCalls } from '../hooks/use-calling'
import { useCampaign } from '../hooks/use-campaigns'
import { CALL_STAGE_TONE } from '../schemas/calling'
import type { CampaignCandidateRow } from '../schemas/campaign-answers'

type Row = CampaignCandidateRow & {
  readonly id: string
  /** Live stage from the calling stream, falling back to the persisted one. */
  readonly liveStage: string
  readonly answers: Readonly<Record<string, string>>
  readonly durationSecs: number | null
}

function StageCell({ stage }: { readonly stage: string }) {
  const tone = CALL_STAGE_TONE[stage]
  if (!tone) return <span className="text-[var(--color-ink-muted)]">{stage}</span>
  return <Badge variant={tone.tone === 'neutral' ? undefined : tone.tone}>{tone.label}</Badge>
}

function answerOr(row: Row, key: string): string {
  const value = row.answers[key]
  return value && value !== 'unknown' ? value : '—'
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const mins = Math.floor(seconds / 60)
  return `${String(mins)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`
}

/** Answer columns mirror the voice agent's own result_schema — these are the
 * fields it actually extracts, not invented ones. */
const COLUMNS: ColumnDef<Row, unknown>[] = [
  {
    id: 'select',
    size: 36,
    header: ({ table }) => (
      <input
        type="checkbox"
        aria-label="Select all candidates"
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
        onClick={(event) => event.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        aria-label={`Select ${row.original.name}`}
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(event) => event.stopPropagation()}
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: 'name',
    header: 'Name',
    size: 150,
    cell: ({ row }) => (
      <span className="font-medium text-[var(--color-ink)]">{row.original.name}</span>
    ),
  },
  {
    accessorKey: 'liveStage',
    header: 'Status',
    size: 110,
    cell: ({ row }) => <StageCell stage={row.original.liveStage} />,
  },
  {
    id: 'interest_level',
    accessorFn: (row) => row.answers['interest_level'] ?? '',
    header: 'Interest',
    size: 90,
    cell: ({ row }) => <span>{answerOr(row.original, 'interest_level')}</span>,
  },
  {
    id: 'requirements',
    accessorFn: (row) => row.answers['requirements'] ?? '',
    header: 'Needs',
    size: 150,
    cell: ({ row }) => <span>{answerOr(row.original, 'requirements')}</span>,
  },
  {
    id: 'notice_period',
    accessorFn: (row) => row.answers['notice_period'] ?? '',
    header: 'Notice',
    size: 100,
    cell: ({ row }) => <span className="machine">{answerOr(row.original, 'notice_period')}</span>,
  },
  {
    id: 'expected_ctc',
    accessorFn: (row) => row.answers['expected_ctc'] ?? '',
    header: 'Expected',
    size: 100,
    cell: ({ row }) => <span className="machine">{answerOr(row.original, 'expected_ctc')}</span>,
  },
  {
    id: 'open_to_relocating',
    accessorFn: (row) => row.answers['open_to_relocating'] ?? '',
    header: 'Relocate',
    size: 85,
    cell: ({ row }) => <span>{answerOr(row.original, 'open_to_relocating')}</span>,
  },
  {
    id: 'skill_match',
    accessorFn: (row) => row.answers['skill_match'] ?? '',
    header: 'Skill Q',
    size: 80,
    cell: ({ row }) => <span>{answerOr(row.original, 'skill_match')}</span>,
  },
  {
    id: 'best_time_to_talk',
    accessorFn: (row) => row.answers['best_time_to_talk'] ?? '',
    header: 'Best time',
    size: 100,
    cell: ({ row }) => <span>{answerOr(row.original, 'best_time_to_talk')}</span>,
  },
  {
    id: 'recommendation',
    accessorFn: (row) => row.answers['recommendation'] ?? '',
    header: 'Verdict',
    size: 100,
    cell: ({ row }) => <span>{answerOr(row.original, 'recommendation')}</span>,
  },
  {
    id: 'duration',
    accessorFn: (row) => row.durationSecs ?? 0,
    header: 'Call',
    size: 70,
    cell: ({ row }) => (
      <span className="machine text-[var(--color-ink-muted)]">
        {formatDuration(row.original.durationSecs)}
      </span>
    ),
  },
]

export function CampaignDashboardPage() {
  const { campaignId: campaignIdParam } = useParams()
  const campaignId = asCampaignId(campaignIdParam ?? '')
  const campaign = useCampaign(campaignId)
  const calls = useCampaignCalls(campaignId)
  const calling = useBulkCalling(campaignId)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'liveStage', desc: false }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [openId, setOpenId] = useState<string | null>(null)

  const callsByCandidate = useMemo(
    () => new Map((calls.data ?? []).map((c) => [c.candidateId, c])),
    [calls.data],
  )

  const rows: Row[] = useMemo(
    () =>
      (campaign.data?.candidates ?? [])
        .filter((c) => c.stage !== 'excluded')
        .map((c) => {
          const call = callsByCandidate.get(c.candidateId)
          return {
            ...c,
            id: c.candidateId,
            liveStage: calling.liveStages[c.candidateId] ?? call?.stage ?? c.stage,
            answers: Object.fromEntries((call?.answers ?? []).map((a) => [a.key, a.value])),
            durationSecs: call?.durationSecs ?? null,
          }
        }),
    [campaign.data, callsByCandidate, calling.liveStages],
  )

  const excluded = campaign.data?.candidates.filter((c) => c.stage === 'excluded') ?? []

  const table = useCandidateTable({
    data: rows,
    columns: COLUMNS,
    sorting,
    onSortingChange: setSorting,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  })

  const selectedIds = rows.filter((row) => rowSelection[row.id]).map((row) => row.id)
  const openCall = openId ? callsByCandidate.get(openId) : undefined

  // Esc closes the detail drawer, matching the Esc affordance it shows.
  useEffect(() => {
    if (!openId) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openId])

  // Funnel counts, derived from real stages — never fabricated.
  const funnel = useMemo(() => {
    const called = rows.filter((r) => r.liveStage !== 'queued').length
    const connected = rows.filter((r) =>
      ['connected', 'qualified', 'interested', 'not_a_fit', 'completed'].includes(r.liveStage),
    ).length
    const qualified = rows.filter((r) => ['qualified', 'interested'].includes(r.liveStage)).length
    return { sourced: rows.length, called, connected, qualified }
  }, [rows])

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar
        title={campaign.data?.name ?? 'Campaign'}
        breadcrumb="campaign"
        action={{ label: 'Search new role', to: '/searches/new' }}
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
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => void campaign.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}

          {campaign.data ? (
            <>
              <div
                data-tour="funnel"
                className="flex items-stretch gap-px border-b border-[var(--color-line)] bg-[var(--color-line)]"
              >
                <FunnelStat label="Sourced" value={funnel.sourced} total={funnel.sourced} />
                <FunnelStat label="Called" value={funnel.called} total={funnel.sourced} />
                <FunnelStat label="Connected" value={funnel.connected} total={funnel.sourced} />
                <FunnelStat label="Qualified" value={funnel.qualified} total={funnel.sourced} />
              </div>

              {calling.status === 'running' ? (
                <div className="border-b border-[var(--color-line)] px-4 py-2" aria-live="polite">
                  <div className="flex items-center gap-3">
                    <div
                      role="progressbar"
                      aria-valuenow={calling.percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Calling progress"
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-sunk)]"
                    >
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
                        style={{ width: `${String(calling.percent)}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-[var(--color-ink-muted)]">{calling.stage}</span>
                  </div>
                </div>
              ) : null}

              {calling.warnings.length > 0 ? (
                <div role="status" className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunk)] px-4 py-2 text-[12px] text-[var(--color-ink-muted)]">
                  {calling.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}

              {calling.status === 'error' ? (
                <p role="alert" className="border-b border-[var(--color-line)] px-4 py-2 text-[13px] text-[var(--color-sig-bad)]">
                  {calling.errorMessage}
                </p>
              ) : null}

              <DataTable table={table}>
                <DataTable.Toolbar>
                  <span className="text-[13px] font-medium text-[var(--color-ink)]">
                    {selectedIds.length > 0
                      ? `${String(selectedIds.length)} selected`
                      : `${String(rows.length)} callable`}
                  </span>
                  {excluded.length > 0 ? (
                    <span className="text-[12px] text-[var(--color-ink-muted)]">
                      · {excluded.length} excluded (no contact info)
                    </span>
                  ) : null}
                  <div className="ml-auto" data-tour="call-button">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={rows.length === 0 || calling.status === 'running'}
                      onClick={() => calling.start(selectedIds)}
                    >
                      {calling.status === 'running'
                        ? 'Calling…'
                        : selectedIds.length > 0
                          ? `Call ${String(selectedIds.length)} selected`
                          : `Call all ${String(rows.length)}`}
                    </Button>
                  </div>
                </DataTable.Toolbar>

                {rows.length === 0 ? (
                  <DataTable.EmptyState>
                    <p className="text-[13px] text-[var(--color-ink-muted)]">
                      Nobody in this campaign has contact info to call.
                    </p>
                  </DataTable.EmptyState>
                ) : (
                  <DataTable.Virtualised
                    estimateSize={40}
                    activeRowId={openId}
                    onRowClick={(rowId) => setOpenId(rowId)}
                  />
                )}
              </DataTable>
            </>
          ) : null}
        </div>

        {openId ? (
          <aside
            data-tour="call-detail"
            className="flex w-[560px] shrink-0 flex-col overflow-hidden border-l border-[var(--color-line)] bg-[var(--color-surface)]"
          >
            {openCall ? (
              <CallDetailPanel key={openCall.candidateId} call={openCall} onClose={() => setOpenId(null)} />
            ) : (
              <div className="p-5 text-[13px] text-[var(--color-ink-muted)]">
                <p>No call has been placed for this candidate yet.</p>
                <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => setOpenId(null)}>
                  Close
                </Button>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  )
}

function FunnelStat({
  label,
  value,
  total,
}: {
  readonly label: string
  readonly value: number
  readonly total: number
}) {
  const percent = total > 0 ? Math.round((value / total) * 100) : null
  return (
    <div className="flex-1 bg-[var(--color-surface)] px-4 py-2.5">
      <div className="machine text-[18px] font-medium text-[var(--color-ink)]">{value}</div>
      <div className="text-[12px] text-[var(--color-ink-muted)]">
        {label}
        {percent !== null && label !== 'Sourced' ? (
          <span className="ml-1.5 text-[11px]">{percent}%</span>
        ) : null}
      </div>
    </div>
  )
}

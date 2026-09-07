import type { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { CandidateDetailPane, SOURCE_LABEL } from '@/features/candidates/components/CandidateDetailPane'
import { useCreateCampaign } from '@/features/campaigns/hooks/use-campaigns'
import { DataTable } from '@/shared/components/data-table/DataTable'
import { useCandidateTable } from '@/shared/components/data-table/useCandidateTable'
import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { TopBar } from '@/shared/components/layout/TopBar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/cn'
import { asSearchId } from '@/shared/types/ids'

import { AddPersonDialog } from '../components/AddPersonDialog'
import { useSearchResults } from '../hooks/use-new-search'
import type { RankedCandidate } from '../schemas/search-spec'

/** id is candidate_id — useCandidateTable needs a stable `id` field. */
type Row = RankedCandidate & { readonly id: string; readonly hasContact: boolean }

const COLUMNS: ColumnDef<Row, unknown>[] = [
  {
    id: 'select',
    size: 36,
    header: ({ table }) => (
      <input
        type="checkbox"
        aria-label="Select all callable candidates"
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
    size: 170,
    cell: ({ row }) => (
      <span className={cn('font-medium', row.original.hasContact ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]')}>
        {row.original.name}
      </span>
    ),
  },
  { accessorKey: 'title', header: 'Title', size: 180 },
  { accessorKey: 'company', header: 'Company', size: 130 },
  { accessorKey: 'location', header: 'Location', size: 110 },
  {
    accessorKey: 'match_score',
    header: 'Match',
    size: 70,
    cell: ({ row }) => <span className="machine tabular-nums">{Math.round(row.original.match_score * 100)}</span>,
  },
  {
    accessorKey: 'source',
    header: 'Source',
    size: 120,
    cell: ({ row }) => (
      <Badge withDot={false} className="text-[10px]">
        {SOURCE_LABEL[row.original.source] ?? row.original.source}
      </Badge>
    ),
  },
  {
    id: 'contact',
    accessorFn: (row) => (row.hasContact ? 1 : 0),
    header: 'Contact',
    size: 110,
    cell: ({ row }) => {
      const { phone, email } = row.original
      if (!phone && !email) return <Badge variant="bad">none</Badge>
      return <Badge variant="good">{phone && email ? 'phone + email' : phone ? 'phone' : 'email'}</Badge>
    },
  },
]

/**
 * The recruiter picks who goes into the campaign. Rows without a phone or
 * email are shown (so nothing is hidden) but flagged — the campaign's clean
 * check will exclude them, and the toolbar says so before "Add to campaign".
 */
export function SearchResultsPage() {
  const { searchId: searchIdParam } = useParams()
  const searchId = asSearchId(searchIdParam ?? '')
  const navigate = useNavigate()
  const results = useSearchResults(searchId)
  const createCampaign = useCreateCampaign()

  const [sorting, setSorting] = useState<SortingState>([{ id: 'match_score', desc: true }])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const rows: Row[] = useMemo(
    () =>
      (results.data?.rows ?? []).map((r) => ({
        ...r,
        id: r.candidate_id,
        hasContact: Boolean(r.phone || r.email),
      })),
    [results.data],
  )

  const table = useCandidateTable({
    data: rows,
    columns: COLUMNS,
    sorting,
    onSortingChange: setSorting,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  })

  const selectedRows = rows.filter((row) => rowSelection[row.id])
  const selectedCallable = selectedRows.filter((row) => row.hasContact).length
  const selectedNoContact = selectedRows.length - selectedCallable
  const open = rows.find((row) => row.id === openId) ?? rows[0] ?? null

  const addToCampaign = () => {
    createCampaign.mutate(
      { searchId, candidateIds: selectedRows.map((row) => row.id) },
      { onSuccess: (campaignId) => navigate(`/campaigns/${campaignId}`) },
    )
  }

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar
        title="Search results"
        breadcrumb={results.data ? `${String(results.data.total)} candidates` : undefined}
      />

      <div className="flex h-full min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col border-r border-[var(--color-line)]">
          {results.isPending ? (
            <div className="flex flex-col gap-2 p-4" aria-busy="true">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : null}

          {results.isError ? (
            <div role="alert" className="p-4 text-[13px]">
              <p className="text-[var(--color-sig-bad)]">Could not load results.</p>
              <Button variant="secondary" size="sm" className="mt-2" onClick={() => void results.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}

          {results.data ? (
            <DataTable table={table}>
              <DataTable.Toolbar>
                <span
                  data-tour="results-toolbar"
                  className="text-[13px] font-medium text-[var(--color-ink)]"
                >
                  {selectedRows.length === 0
                    ? `${String(rows.length)} candidates`
                    : `${String(selectedRows.length)} selected`}
                </span>
                {selectedNoContact > 0 ? (
                  <span className="text-[12px] text-[var(--color-ink-muted)]">
                    · {selectedNoContact} without contact info will be excluded from calling
                  </span>
                ) : null}
                {createCampaign.isError ? (
                  <span role="alert" className="text-[12px] text-[var(--color-sig-bad)]">
                    Could not create the campaign. Try again.
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)}>
                    Add person
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={selectedRows.length === 0 || createCampaign.isPending}
                    onClick={addToCampaign}
                  >
                    {createCampaign.isPending
                      ? 'Creating…'
                      : `Add ${selectedRows.length > 0 ? String(selectedRows.length) + ' ' : ''}to campaign`}
                  </Button>
                </div>
              </DataTable.Toolbar>

              {rows.length === 0 ? (
                <DataTable.EmptyState>
                  <p className="text-[13px] text-[var(--color-ink-muted)]">No candidates yet.</p>
                  <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                    Add a person
                  </Button>
                </DataTable.EmptyState>
              ) : (
                <DataTable.Virtualised estimateSize={40} activeRowId={open?.id ?? null} onRowClick={setOpenId} />
              )}
            </DataTable>
          ) : null}
        </div>

        <div data-tour="candidate-detail" className="w-96 shrink-0 overflow-auto p-5">
          {open ? (
            <CandidateDetailPane
              key={open.id}
              candidate={{ ...open, linkedinUrl: open.linkedin_url, matchedKeywords: open.matched_keywords }}
            />
          ) : (
            <p className="text-[13px] text-[var(--color-ink-muted)]">Select a candidate to see details.</p>
          )}
        </div>
      </div>

      <AddPersonDialog searchId={searchId} open={adding} onOpenChange={setAdding} />
    </div>
  )
}

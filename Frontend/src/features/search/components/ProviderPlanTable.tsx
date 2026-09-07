import { useState } from 'react'

import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { cn } from '@/shared/lib/cn'
import { PROVIDER_LABEL } from '@/shared/types/domain'
import type { SearchId } from '@/shared/types/ids'

import { useProviderPlan, useRunSearch } from '../hooks/use-new-search'
import { DATA_SOURCE_OPTIONS, type DataSource, type ProviderPlanRow } from '../schemas/search-spec'

const DEFAULT_RESULTS_NEEDED = 25

export function ProviderPlanTable({
  searchId,
  onStarted,
}: {
  readonly searchId: SearchId
  readonly onStarted: () => void
}) {
  const [resultsNeeded, setResultsNeeded] = useState(DEFAULT_RESULTS_NEEDED)
  const [dataSource, setDataSource] = useState<DataSource>('linkedin')
  const plan = useProviderPlan(resultsNeeded)
  const runSearch = useRunSearch()

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-4">
      <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">Provider plan</h2>

      <div className="flex items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--color-ink)]">Results needed</span>
          <Input
            type="number"
            min={1}
            max={1000}
            value={resultsNeeded}
            onChange={(event) => setResultsNeeded(Math.max(1, Number(event.target.value) || 1))}
            className="w-28"
            aria-label="Number of results needed"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-[var(--color-ink)]">Source</span>
          <Select value={dataSource} onValueChange={(value) => setDataSource(value as DataSource)}>
            <SelectTrigger className="w-40" aria-label="Data source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATA_SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={!option.enabled}>
                  {option.label}
                  {!option.enabled ? ' (coming soon)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {plan.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : null}

      {plan.isError ? (
        <div role="alert" className="text-[13px]">
          <p className="text-[var(--color-sig-bad)]">Could not load the provider plan.</p>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void plan.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}

      {plan.data ? (
        <PlanDetails
          plan={plan.data}
          resultsNeeded={resultsNeeded}
          runSearch={runSearch}
          onRun={() => runSearch.mutate(searchId, { onSuccess: onStarted })}
        />
      ) : null}
    </div>
  )
}

function PlanDetails({
  plan,
  resultsNeeded,
  runSearch,
  onRun,
}: {
  readonly plan: {
    readonly rows: readonly ProviderPlanRow[]
    readonly total_cost_usd: number
    readonly enrich_credits_remaining: number
    readonly enrich_credit_cap: number
    readonly exceeds_credit_cap: boolean
  }
  readonly resultsNeeded: number
  readonly runSearch: { readonly isPending: boolean; readonly isError: boolean }
  readonly onRun: () => void
}) {
  const enrichRow = plan.rows.find((row) => row.provider === 'enrich')

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Results</TableHead>
            <TableHead className="text-right">Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {plan.rows.map((row) => (
            <TableRow key={row.provider} className={cn(!row.enabled && 'opacity-50')}>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  {PROVIDER_LABEL[row.provider]}
                  {!row.enabled ? (
                    <Badge withDot={false} className="text-[10px]">
                      Not enabled
                    </Badge>
                  ) : null}
                </span>
                {row.note ? (
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{row.note}</p>
                ) : null}
              </TableCell>
              <TableCell className="machine text-right">{row.enabled ? resultsNeeded : '—'}</TableCell>
              <TableCell className="machine text-right">
                {row.cost_usd !== null
                  ? `$${row.cost_usd.toFixed(4)}`
                  : row.cost_credits !== null
                    ? `${String(row.cost_credits)} credits`
                    : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-1 text-[13px]">
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-ink-muted)]">Apify cost</span>
          <span className="machine font-medium text-[var(--color-ink)]">
            ${plan.total_cost_usd.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[var(--color-ink-muted)]">Enrich.so credits</span>
          <span
            className={cn(
              'machine font-medium',
              plan.exceeds_credit_cap ? 'text-[var(--color-sig-bad)]' : 'text-[var(--color-ink)]',
            )}
          >
            {enrichRow?.cost_credits ?? 0} of {plan.enrich_credits_remaining} remaining (cap{' '}
            {plan.enrich_credit_cap})
          </span>
        </div>
      </div>

      {plan.exceeds_credit_cap ? (
        <p role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
          This plan needs more Enrich.so credits than the account has left ({plan.enrich_credits_remaining}{' '}
          remaining). Lower the number of results before running.
        </p>
      ) : null}

      {runSearch.isError ? (
        <p role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
          Could not start the search. Try again.
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          variant="primary"
          disabled={plan.exceeds_credit_cap || runSearch.isPending}
          onClick={onRun}
        >
          {runSearch.isPending ? 'Starting…' : 'Run search'}
        </Button>
      </div>
    </>
  )
}

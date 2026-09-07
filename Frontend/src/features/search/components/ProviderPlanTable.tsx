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

import { useProviderPlan } from '../hooks/use-new-search'
import { DATA_SOURCE_OPTIONS, type DataSource, type ProviderPlanRow } from '../schemas/search-spec'

const DEFAULT_RESULTS_NEEDED = 25

export function ProviderPlanTable({
  onRun,
}: {
  /** The parent owns the run itself (it swaps this panel for the progress view). */
  readonly onRun: (resultsNeeded: number) => void
}) {
  const [resultsNeeded, setResultsNeeded] = useState(DEFAULT_RESULTS_NEEDED)
  const [dataSource, setDataSource] = useState<DataSource>('linkedin')
  const plan = useProviderPlan(resultsNeeded)

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
          onRun={() => onRun(resultsNeeded)}
        />
      ) : null}
    </div>
  )
}

function PlanDetails({
  plan,
  resultsNeeded,
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
              <TableCell className="machine text-right">{row.enabled ? row.results : '—'}</TableCell>
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

      <div>
        <Button
          type="button"
          variant="primary"
          disabled={plan.exceeds_credit_cap}
          onClick={onRun}
        >
          Run search
        </Button>
      </div>
    </>
  )
}

import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { Button } from '@/shared/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { formatCurrency } from '@/shared/lib/format'
import { PROVIDER_LABEL } from '@/shared/types/domain'
import type { SearchId } from '@/shared/types/ids'

import { useProviderPlan, useRunSearch } from '../hooks/use-new-search'

export function ProviderPlanTable({
  searchId,
  onStarted,
}: {
  readonly searchId: SearchId
  readonly onStarted: () => void
}) {
  const plan = useProviderPlan(searchId)
  const runSearch = useRunSearch()

  if (plan.isPending) {
    return (
      <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-4" aria-busy="true">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (plan.isError) {
    return (
      <div role="alert" className="border-t border-[var(--color-line)] pt-4 text-[13px]">
        <p className="text-[var(--color-sig-bad)]">Could not load the provider plan.</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => void plan.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const { rows, totalCredits, budgetCredits, currency } = plan.data
  const overBudget = totalCredits > budgetCredits
  const overageCredits = totalCredits - budgetCredits

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-4">
      <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">Provider plan</h2>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Provider</TableHead>
            <TableHead className="text-right">Estimated results</TableHead>
            <TableHead className="text-right">Estimated credits</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.provider}>
              <TableCell>{PROVIDER_LABEL[row.provider]}</TableCell>
              <TableCell className="machine text-right">{row.estimatedResults}</TableCell>
              <TableCell className="machine text-right">{row.estimatedCredits}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between text-[13px]">
        <span className="text-[var(--color-ink-muted)]">Total cost</span>
        <span className="machine font-medium text-[var(--color-ink)]">
          {totalCredits} credits ({formatCurrency(totalCredits * 100, currency)})
        </span>
      </div>

      {overBudget ? (
        <p role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
          This plan exceeds the configured budget by {overageCredits} credits. Reduce scope or
          raise the budget before running.
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
          disabled={overBudget || runSearch.isPending}
          onClick={() => runSearch.mutate(searchId, { onSuccess: onStarted })}
        >
          {runSearch.isPending ? 'Starting…' : 'Run search'}
        </Button>
      </div>
    </div>
  )
}

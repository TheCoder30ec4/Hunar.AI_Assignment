import { useState, type FormEvent } from 'react'

import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { TopBar } from '@/shared/components/layout/TopBar'
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
import { formatRelative } from '@/shared/lib/format'

import {
  useAddSuppression,
  useRemoveSuppression,
  useSuppressionList,
} from '../hooks/use-suppression'
import { REASON_LABEL, TYPE_LABEL, type SuppressionEntry } from '../schemas/suppression'

/**
 * The do-not-call list. Anyone here is filtered out of every calling batch
 * before the provider is contacted (Backend/services/calling_service.py), so
 * this is an enforcement surface, not a record-keeping one.
 *
 * Identifiers are stored as salted hashes and never in plaintext — a list of
 * people who asked not to be contacted is the last place their phone number
 * should live. That's why rows show a hash prefix instead of the number, and
 * why removing an entry is the only way to "see" whether someone is on it
 * (you check by adding: a duplicate is reported as already suppressed).
 */
export function SuppressionPage() {
  const list = useSuppressionList()

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="Suppression list" breadcrumb="do not call" />
      <div className="overflow-auto p-6">
        <div className="mx-auto max-w-3xl">
          <AddForm />

          <div className="mt-6">
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">
                Suppressed identifiers
              </h2>
              {list.data ? (
                <span className="text-[12px] text-[var(--color-ink-muted)]">
                  {list.data.length} total
                </span>
              ) : null}
            </div>

            {list.isPending ? <Skeleton className="h-40 w-full" /> : null}

            {list.isError ? (
              <div role="alert" className="text-[13px]">
                <p className="text-[var(--color-sig-bad)]">Could not load the suppression list.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  onClick={() => void list.refetch()}
                >
                  Retry
                </Button>
              </div>
            ) : null}

            {list.data && list.data.length === 0 ? (
              <p className="rounded-[var(--radius-control)] border border-[var(--color-line)] p-4 text-[13px] text-[var(--color-ink-muted)]">
                Nobody is suppressed. Anyone added here is skipped by every campaign.
              </p>
            ) : null}

            {list.data && list.data.length > 0 ? (
              <div className="rounded-[var(--radius-control)] border border-[var(--color-line)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Identifier</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.data.map((entry) => (
                      <EntryRow key={entry.id} entry={entry} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function EntryRow({ entry }: { readonly entry: SuppressionEntry }) {
  const remove = useRemoveSuppression()

  return (
    <TableRow>
      <TableCell>
        <Badge withDot={false} className="text-[10px]">
          {TYPE_LABEL[entry.identifierType]}
        </Badge>
      </TableCell>
      <TableCell className="machine text-[12px] text-[var(--color-ink-muted)]">
        {entry.identifierPreview}
      </TableCell>
      <TableCell>{REASON_LABEL[entry.reason]}</TableCell>
      <TableCell className="text-[var(--color-ink-muted)]">{entry.source ?? '—'}</TableCell>
      <TableCell className="text-[var(--color-ink-muted)]">
        {formatRelative(entry.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={remove.isPending}
          onClick={() => remove.mutate(entry.id)}
        >
          Remove
        </Button>
      </TableCell>
    </TableRow>
  )
}

const EMPTY = { identifier: '', type: 'phone' as const, reason: 'opt_out' as const }

function AddForm() {
  const add = useAddSuppression()
  const [form, setForm] = useState<{
    identifier: string
    type: SuppressionEntry['identifierType']
    reason: SuppressionEntry['reason']
  }>(EMPTY)
  const [duplicate, setDuplicate] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setDuplicate(false)
    add.mutate(
      {
        identifier_type: form.type,
        identifier: form.identifier.trim(),
        reason: form.reason,
        source: 'added in app',
      },
      {
        onSuccess: (entry) => {
          // null means the identifier was already on the list.
          if (entry === null) setDuplicate(true)
          else setForm(EMPTY)
        },
      },
    )
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
    >
      <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">Suppress an identifier</h2>
      <p className="mb-3 mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
        Stored as a one-way hash, never in plaintext. Every campaign checks this list before
        placing a call.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--color-ink-muted)]">Type</span>
          <Select
            value={form.type}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, type: value as SuppressionEntry['identifierType'] }))
            }
          >
            <SelectTrigger className="w-32" aria-label="Identifier type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="linkedin">LinkedIn</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <label className="flex min-w-56 flex-1 flex-col gap-1">
          <span className="text-[12px] text-[var(--color-ink-muted)]">
            {form.type === 'phone'
              ? 'Phone number'
              : form.type === 'email'
                ? 'Email address'
                : 'LinkedIn URL'}
          </span>
          <Input
            value={form.identifier}
            onChange={(event) => setForm((prev) => ({ ...prev, identifier: event.target.value }))}
            placeholder={
              form.type === 'phone'
                ? '+91 98765 43210'
                : form.type === 'email'
                  ? 'name@company.com'
                  : 'https://linkedin.com/in/…'
            }
            required
            aria-label="Identifier"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--color-ink-muted)]">Reason</span>
          <Select
            value={form.reason}
            onValueChange={(value) =>
              setForm((prev) => ({ ...prev, reason: value as SuppressionEntry['reason'] }))
            }
          >
            <SelectTrigger className="w-44" aria-label="Reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opt_out">Opted out</SelectItem>
              <SelectItem value="dnc_registry">DNC registry</SelectItem>
              <SelectItem value="manual">Added manually</SelectItem>
              <SelectItem value="bounce">Bounced</SelectItem>
            </SelectContent>
          </Select>
        </label>

        <Button
          type="submit"
          variant="primary"
          disabled={add.isPending || form.identifier.trim().length === 0}
        >
          {add.isPending ? 'Adding…' : 'Suppress'}
        </Button>
      </div>

      {duplicate ? (
        <p role="status" className="mt-2 text-[12px] text-[var(--color-ink-muted)]">
          That identifier is already suppressed.
        </p>
      ) : null}
      {add.isError ? (
        <p role="alert" className="mt-2 text-[12px] text-[var(--color-sig-bad)]">
          Could not add that identifier. Check the format and try again.
        </p>
      ) : null}
    </form>
  )
}

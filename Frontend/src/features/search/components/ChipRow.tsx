import { XIcon } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'

import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/lib/cn'

/**
 * One row of the "these filters are what gets sent to the providers" table:
 * a label, the current chips, and an inline "+ add" affordance. Shared by
 * every editable array field (titles, must-have, nice-to-have, company size,
 * exclusions) so the row markup and add/remove behaviour live in one place.
 */
export function ChipRow({
  label,
  values,
  onAdd,
  onRemove,
  error,
  placeholder = 'Add and press Enter',
}: {
  readonly label: string
  readonly values: readonly string[]
  readonly onAdd: (value: string) => void
  readonly onRemove: (value: string) => void
  readonly error?: string | undefined
  readonly placeholder?: string | undefined
}) {
  const [draft, setDraft] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const commit = (): void => {
    const trimmed = draft.trim()
    if (trimmed.length > 0) onAdd(trimmed)
    setDraft('')
    setIsAdding(false)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    }
    if (event.key === 'Escape') {
      setDraft('')
      setIsAdding(false)
    }
  }

  return (
    <div className="flex items-start gap-4 py-2">
      <span className="w-32 shrink-0 pt-1 text-[13px] text-[var(--color-ink-muted)]">{label}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {values.map((value) => (
            <Badge key={value} withDot={false} className="gap-1 pr-1">
              {value}
              <button
                type="button"
                onClick={() => onRemove(value)}
                aria-label={`Remove ${value}`}
                className="rounded-full p-0.5 hover:bg-[var(--color-line)]"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}

          {isAdding ? (
            <Input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commit}
              placeholder={placeholder}
              className="h-7 w-44"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              className={cn(
                'rounded-[var(--radius-control)] border border-dashed border-[var(--color-line)]',
                'px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)]',
                'hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
              )}
            >
              + add
            </button>
          )}
        </div>
        {error ? <p className="text-[12px] text-[var(--color-sig-bad)]">{error}</p> : null}
      </div>
    </div>
  )
}

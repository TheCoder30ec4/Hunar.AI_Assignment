import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/cn'

/**
 * Square cells (--radius-cell is 0px), --color-line borders, and NO shadow.
 * Shadow is reserved for modals, drawers and the command palette.
 *
 * This is the plain semantic table for small static lists. The virtualised
 * 10k-row table is a separate grid-based component (shared/components/data-table).
 */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        className={cn('w-full caption-bottom border-collapse text-[13px]', className)}
        {...props}
      />
    </div>
  )
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b [&_tr]:border-[var(--color-line)]', className)} {...props} />
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

export function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
  return (
    <tfoot
      className={cn(
        'border-t border-[var(--color-line)] bg-[var(--color-surface-sunk)] font-medium',
        className,
      )}
      {...props}
    />
  )
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr
      className={cn(
        'border-b border-[var(--color-line)] transition-colors',
        'hover:bg-[var(--color-surface-sunk)]',
        'data-[state=selected]:bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-8 px-2 text-left align-middle font-medium text-[var(--color-ink-muted)]',
        'rounded-[var(--radius-cell)] whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return (
    <td
      className={cn('h-9 px-2 align-middle rounded-[var(--radius-cell)]', className)}
      {...props}
    />
  )
}

export function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
  return <caption className={cn('mt-3 text-[var(--color-ink-muted)]', className)} {...props} />
}

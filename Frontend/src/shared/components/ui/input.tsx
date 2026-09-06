import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/cn'

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-8 w-full rounded-[var(--radius-control)] border border-[var(--color-line)]',
        'bg-[var(--color-surface)] px-2.5 py-1 text-[13px] text-[var(--color-ink)]',
        'placeholder:text-[var(--color-ink-muted)]',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-[var(--color-sig-bad)]',
        className,
      )}
      {...props}
    />
  )
}

import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/cn'

/**
 * A pulsing placeholder shaped like the content it stands in for — never a
 * spinner. Callers set width/height via className so the skeleton matches
 * the real content's dimensions exactly (no layout shift on load).
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-[var(--radius-control)] bg-[var(--color-surface-sunk)]', className)}
      {...props}
    />
  )
}

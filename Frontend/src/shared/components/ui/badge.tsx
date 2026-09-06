import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/cn'

/**
 * Signal variants map to call state and data quality only — never chrome.
 *
 * A11y floor: colour is never the sole carrier of meaning. Every signal variant
 * renders a shape (the leading dot) alongside its text label, so the badge still
 * reads correctly in greyscale or with a colour-vision deficiency.
 */
const badgeVariants = cva(
  cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap',
    'rounded-[var(--radius-control)] border px-1.5 py-0.5',
    'text-[11px] font-medium leading-none',
  ),
  {
    variants: {
      variant: {
        neutral:
          'border-[var(--color-line)] bg-[var(--color-surface-sunk)] text-[var(--color-ink)]',
        live: 'border-[var(--color-sig-live)] bg-transparent text-[var(--color-sig-live)]',
        good: 'border-[var(--color-sig-good)] bg-transparent text-[var(--color-sig-good)]',
        bad: 'border-[var(--color-sig-bad)] bg-transparent text-[var(--color-sig-bad)]',
        cold: 'border-[var(--color-sig-cold)] bg-transparent text-[var(--color-sig-cold)]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
)

const DOT_COLOR = {
  neutral: 'bg-[var(--color-ink-muted)]',
  live: 'bg-[var(--color-sig-live)]',
  good: 'bg-[var(--color-sig-good)]',
  bad: 'bg-[var(--color-sig-bad)]',
  cold: 'bg-[var(--color-sig-cold)]',
} as const

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    readonly asChild?: boolean | undefined
    /** Set false only where an adjacent element already carries the shape. */
    readonly withDot?: boolean | undefined
  }

export function Badge({
  className,
  variant,
  asChild = false,
  withDot = true,
  children,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot : 'span'
  const tone = variant ?? 'neutral'
  return (
    <Comp className={cn(badgeVariants({ variant }), className)} {...props}>
      {withDot ? (
        <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', DOT_COLOR[tone])} />
      ) : null}
      {children}
    </Comp>
  )
}

export { badgeVariants }

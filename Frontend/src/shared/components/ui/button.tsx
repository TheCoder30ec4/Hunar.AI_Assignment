import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/cn'

/**
 * Sentence case only — no ALL CAPS labels, no `→` glyphs in button text.
 * The focus ring is present on every variant and is never removed.
 */
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'rounded-[var(--radius-control)] text-[13px] font-medium',
    'transition-colors disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
  ),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--color-accent)] text-[var(--color-surface)] hover:bg-[color-mix(in_srgb,var(--color-accent)_88%,black)]',
        secondary:
          'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-[var(--color-surface-sunk)]',
        ghost: 'text-[var(--color-ink)] hover:bg-[var(--color-surface-sunk)]',
        destructive:
          'bg-[var(--color-sig-bad)] text-[var(--color-surface)] hover:bg-[color-mix(in_srgb,var(--color-sig-bad)_88%,black)]',
        link: 'text-[var(--color-accent)] underline-offset-4 hover:underline',
      },
      size: {
        // 28px — dense default for a toolbar-heavy ops tool.
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3',
        lg: 'h-9 px-4',
        icon: 'size-7',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean | undefined
  }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }

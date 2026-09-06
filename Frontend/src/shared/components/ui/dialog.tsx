import * as DialogPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/lib/cn'

/**
 * Radix handles the a11y floor for us and we keep all of it: focus is trapped
 * while open, Escape closes, and focus returns to the trigger on close.
 *
 * This is one of the three places --shadow-float is legitimate
 * (modals, drawers, command palette). Tables and panels use borders instead.
 */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 z-50 bg-[rgb(15_25_35_/_0.32)]',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4',
          'border border-[var(--color-line)] bg-[var(--color-surface)] p-5',
          'rounded-[var(--radius-control)] shadow-[var(--shadow-float)]',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-3 rounded-[var(--radius-control)] p-1',
            'text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunk)]',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
          )}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-row justify-end gap-2', className)} {...props} />
  )
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-[15px] font-semibold text-[var(--color-ink)]', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-[13px] text-[var(--color-ink-muted)]', className)}
      {...props}
    />
  )
}

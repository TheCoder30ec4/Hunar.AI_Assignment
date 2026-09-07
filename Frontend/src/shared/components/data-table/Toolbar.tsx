import type { ReactNode } from 'react'

export function Toolbar({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-2 py-1.5">
      {children}
    </div>
  )
}

import type { ReactNode } from 'react'

export function EmptyState({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-8 text-center">
      {children}
    </div>
  )
}

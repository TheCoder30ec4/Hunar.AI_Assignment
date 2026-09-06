import { Skeleton } from '@/shared/components/feedback/Skeleton'

/** Matches FilterChips' layout exactly — shown while parseJd is pending. */
export function FilterChipsSkeleton() {
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-3" aria-busy="true">
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-wrap gap-2">
        {[64, 88, 52, 96, 72].map((width) => (
          <Skeleton key={width} className="h-7" style={{ width }} />
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-40" />
      </div>
    </div>
  )
}

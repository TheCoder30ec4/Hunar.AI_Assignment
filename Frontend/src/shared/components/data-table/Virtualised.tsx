import { flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

import { cn } from '@/shared/lib/cn'

import { useDataTableContext } from './context'
import { useTableKeyboardNav } from './useTableKeyboardNav'

/**
 * useVirtualizer returns absolutely-positioned rows, which fights real
 * <table> layout — so this renders a CSS grid instead, with
 * grid-template-columns pulled from TanStack's own column sizes, and
 * role="table"/"rowgroup"/"row"/"cell" to keep the semantics a real table
 * would have given for free. aria-rowcount is the FULL row count, not how
 * many are actually mounted — otherwise a screen reader reports 30 rows
 * instead of 10,000.
 *
 * Sticky header + sticky first column together need a deliberate z-stack:
 * header z-20, first column z-10, the one corner cell where they overlap
 * z-30 — get this wrong and the header visibly slides under the pinned
 * column on a diagonal scroll.
 */
export function Virtualised<TData extends { id: string }>({
  estimateSize = 36,
  overscan = 12,
  onRowClick,
  stickyFirstColumn = false,
}: {
  readonly estimateSize?: number
  readonly overscan?: number
  readonly onRowClick?: ((rowId: string) => void) | undefined
  readonly stickyFirstColumn?: boolean | undefined
}) {
  const table = useDataTableContext<TData>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const rows = table.getRowModel().rows
  const columns = table.getVisibleLeafColumns()

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  })

  const { focusedCell, handleKeyDown, handleRowClick } = useTableKeyboardNav({
    table,
    rowVirtualizer,
    onOpenRow: onRowClick,
  })

  const gridTemplateColumns = columns
    .map((column) => `${String(column.getSize())}px`)
    .join(' ')

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalSize = rowVirtualizer.getTotalSize()
  const paddingTop = virtualRows[0]?.start ?? 0
  const paddingBottom = totalSize - (virtualRows.at(-1)?.end ?? 0)

  return (
    <div
      ref={scrollRef}
      role="table"
      aria-rowcount={rows.length}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative h-full overflow-auto outline-none"
    >
      <div role="rowgroup" className="sticky top-0 z-20 grid" style={{ gridTemplateColumns }}>
        {table.getHeaderGroups().map((headerGroup) => (
          <div role="row" key={headerGroup.id} className="contents">
            {headerGroup.headers.map((header, columnIndex) => (
              <div
                key={header.id}
                role="columnheader"
                aria-sort={
                  header.column.getIsSorted() === 'asc'
                    ? 'ascending'
                    : header.column.getIsSorted() === 'desc'
                      ? 'descending'
                      : 'none'
                }
                onClick={header.column.getToggleSortingHandler()}
                className={cn(
                  'flex h-9 items-center border-b border-[var(--color-line)] bg-[var(--color-surface)]',
                  'px-2 text-[12px] font-medium text-[var(--color-ink-muted)]',
                  header.column.getCanSort() && 'cursor-pointer select-none',
                  stickyFirstColumn && columnIndex === 0 && 'sticky left-0 z-30 bg-[var(--color-surface)]',
                )}
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div role="rowgroup" style={{ paddingTop, paddingBottom }}>
        {virtualRows.map((virtualRow) => {
          const row = rows[virtualRow.index]
          if (!row) return null
          const isFocusedRow = focusedCell.rowIndex === virtualRow.index
          const cells = row.getVisibleCells()

          return (
            <div
              key={row.id}
              role="row"
              data-index={virtualRow.index}
              aria-selected={row.getIsSelected()}
              onClick={(event) => handleRowClick(virtualRow.index, event)}
              className={cn(
                'grid border-b border-[var(--color-line)] hover:bg-[var(--color-surface-sunk)]',
                row.getIsSelected() && 'bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]',
              )}
              style={{ gridTemplateColumns, height: estimateSize }}
            >
              {cells.map((cell, columnIndex) => {
                const isFocusedCell = isFocusedRow && focusedCell.columnIndex === columnIndex
                return (
                  <div
                    key={cell.id}
                    role="cell"
                    tabIndex={isFocusedCell ? 0 : -1}
                    className={cn(
                      'flex items-center overflow-hidden px-2 text-[13px] text-[var(--color-ink)]',
                      'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]',
                      stickyFirstColumn &&
                        columnIndex === 0 &&
                        'sticky left-0 z-10 bg-[var(--color-surface)]',
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

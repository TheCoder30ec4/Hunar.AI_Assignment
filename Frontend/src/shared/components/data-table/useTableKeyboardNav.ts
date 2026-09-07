import { useCallback, useRef, useState } from 'react'
import type { Table } from '@tanstack/react-table'
import type { Virtualizer } from '@tanstack/react-virtual'

export interface FocusedCell {
  readonly rowIndex: number
  readonly columnIndex: number
}

export interface UseTableKeyboardNavOptions<TData> {
  readonly table: Table<TData>
  readonly rowVirtualizer: Pick<Virtualizer<HTMLDivElement, Element>, 'scrollToIndex'>
  readonly onOpenRow?: ((rowId: string) => void) | undefined
}

/**
 * Roving tabIndex: exactly one cell is ever tab-reachable at a time, arrows
 * move focus between cells, Enter opens the row, Space toggles its
 * selection, Esc clears selection. Shift+click / Shift+ArrowDown select the
 * inclusive span against the SORTED row model (table.getRowModel()), not
 * the raw input array — sorting the table must not scramble what a
 * shift-range selects.
 */
export function useTableKeyboardNav<TData extends { id: string }>({
  table,
  rowVirtualizer,
  onOpenRow,
}: UseTableKeyboardNavOptions<TData>) {
  const [focusedCell, setFocusedCell] = useState<FocusedCell>({ rowIndex: 0, columnIndex: 0 })
  const lastSelectedIndexRef = useRef<number | null>(null)

  const rows = table.getRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()

  const moveFocus = useCallback(
    (nextRowIndex: number, nextColumnIndex: number) => {
      const clampedRow = Math.max(0, Math.min(rows.length - 1, nextRowIndex))
      const clampedColumn = Math.max(0, Math.min(visibleColumns.length - 1, nextColumnIndex))
      setFocusedCell({ rowIndex: clampedRow, columnIndex: clampedColumn })
      // The target row may be outside the virtualiser's rendered window —
      // without this, focus lands on a cell that was never mounted and the
      // browser silently does nothing.
      rowVirtualizer.scrollToIndex(clampedRow)
    },
    [rows.length, visibleColumns.length, rowVirtualizer],
  )

  const selectRange = useCallback(
    (toIndex: number) => {
      const fromIndex = lastSelectedIndexRef.current ?? toIndex
      const [start, end] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex]

      const nextSelection: Record<string, boolean> = { ...table.getState().rowSelection }
      for (let i = start; i <= end; i += 1) {
        const row = rows[i]
        if (row) nextSelection[row.id] = true
      }
      table.setRowSelection(nextSelection)
    },
    [rows, table],
  )

  const toggleRowSelected = useCallback(
    (rowIndex: number) => {
      const row = rows[rowIndex]
      if (!row) return
      row.toggleSelected()
      lastSelectedIndexRef.current = rowIndex
    },
    [rows],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { rowIndex, columnIndex } = focusedCell

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          if (event.shiftKey) {
            selectRange(Math.min(rows.length - 1, rowIndex + 1))
          }
          moveFocus(rowIndex + 1, columnIndex)
          break
        case 'ArrowUp':
          event.preventDefault()
          if (event.shiftKey) {
            selectRange(Math.max(0, rowIndex - 1))
          }
          moveFocus(rowIndex - 1, columnIndex)
          break
        case 'ArrowRight':
          event.preventDefault()
          moveFocus(rowIndex, columnIndex + 1)
          break
        case 'ArrowLeft':
          event.preventDefault()
          moveFocus(rowIndex, columnIndex - 1)
          break
        case 'Enter': {
          event.preventDefault()
          const row = rows[rowIndex]
          if (row) onOpenRow?.(row.id)
          break
        }
        case ' ':
          event.preventDefault()
          toggleRowSelected(rowIndex)
          break
        case 'Escape':
          event.preventDefault()
          table.resetRowSelection()
          lastSelectedIndexRef.current = null
          break
        default:
          break
      }
    },
    [focusedCell, moveFocus, rows, onOpenRow, toggleRowSelected, selectRange, table],
  )

  const handleRowClick = useCallback(
    (rowIndex: number, event: React.MouseEvent) => {
      setFocusedCell((prev) => ({ ...prev, rowIndex }))
      if (event.shiftKey) {
        selectRange(rowIndex)
        return
      }
      toggleRowSelected(rowIndex)
    },
    [selectRange, toggleRowSelected],
  )

  return { focusedCell, handleKeyDown, handleRowClick }
}

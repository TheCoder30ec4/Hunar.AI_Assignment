import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type Table,
  type VisibilityState,
} from '@tanstack/react-table'

/**
 * Headless: returns the TanStack Table instance, nothing rendered. Usable
 * in a unit test with no DOM, and reused by every screen that needs a
 * dense, sortable, filterable, virtualised row set (results, answers,
 * suppression, call queue) — the same hook, different column defs and data.
 *
 * Column defs MUST live at module scope in the calling file, not be
 * constructed inline here or in the component. A fresh array identity on
 * every render resets TanStack Table's internal column cache — sizing,
 * visibility and order all silently reset. This hook can't enforce that
 * from the outside; it's a convention every caller has to hold.
 */
export interface UseCandidateTableOptions<TData extends { id: string }> {
  readonly data: readonly TData[]
  // `unknown`, not `never`, as the cell value type: `never` makes any column
  // with an accessorFn un-typeable, because the function's return has to be
  // assignable to it. Cell renderers read row.original directly, so this
  // type only feeds sorting/filtering comparisons.
  readonly columns: ColumnDef<TData, unknown>[]
  readonly sorting: SortingState
  readonly onSortingChange: (updater: SortingState | ((prev: SortingState) => SortingState)) => void
  readonly columnVisibility?: VisibilityState | undefined
  readonly onColumnVisibilityChange?:
    | ((updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => void)
    | undefined
  readonly rowSelection?: RowSelectionState | undefined
  readonly onRowSelectionChange?:
    | ((updater: RowSelectionState | ((prev: RowSelectionState) => RowSelectionState)) => void)
    | undefined
  readonly columnFilters?: ColumnFiltersState | undefined
  readonly onColumnFiltersChange?:
    | ((updater: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => void)
    | undefined
}

export function useCandidateTable<TData extends { id: string }>(
  options: UseCandidateTableOptions<TData>,
): Table<TData> {
  const {
    data,
    columns,
    sorting,
    onSortingChange,
    columnVisibility,
    onColumnVisibilityChange,
    rowSelection,
    onRowSelectionChange,
    columnFilters,
    onColumnFiltersChange,
  } = options

  return useReactTable({
    data: data as TData[],
    columns,
    // Stable, never index-based — selection and sort would otherwise
    // silently point at the wrong row the moment sort order changes.
    getRowId: (row) => row.id,
    state: {
      sorting,
      ...(columnVisibility !== undefined ? { columnVisibility } : {}),
      ...(rowSelection !== undefined ? { rowSelection } : {}),
      ...(columnFilters !== undefined ? { columnFilters } : {}),
    },
    onSortingChange: (updater) =>
      onSortingChange(typeof updater === 'function' ? updater(sorting) : updater),
    ...(onColumnVisibilityChange
      ? {
          onColumnVisibilityChange: (updater) =>
            onColumnVisibilityChange(
              typeof updater === 'function' ? updater(columnVisibility ?? {}) : updater,
            ),
        }
      : {}),
    ...(onRowSelectionChange
      ? {
          onRowSelectionChange: (updater) =>
            onRowSelectionChange(
              typeof updater === 'function' ? updater(rowSelection ?? {}) : updater,
            ),
        }
      : {}),
    ...(onColumnFiltersChange
      ? {
          onColumnFiltersChange: (updater) =>
            onColumnFiltersChange(
              typeof updater === 'function' ? updater(columnFilters ?? []) : updater,
            ),
        }
      : {}),
    // Virtualised, not paginated — every row is in the DOM's data model, the
    // virtualiser decides what's actually rendered.
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })
}

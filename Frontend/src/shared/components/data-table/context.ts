import { createContext, useContext } from 'react'
import type { Table } from '@tanstack/react-table'

/**
 * Generics don't survive JSX compound children — <DataTable.Toolbar/> can't
 * know DataTable's TData. The instance goes through context typed as
 * Table<unknown>; each subcomponent casts back at its own boundary. A
 * factory-per-row-type would keep the generic end-to-end but isn't worth
 * the complexity for four call sites.
 */
export const DataTableContext = createContext<Table<unknown> | null>(null)

export function useDataTableContext<TData>(): Table<TData> {
  const table = useContext(DataTableContext)
  if (!table) {
    throw new Error('DataTable.* components must be rendered inside <DataTable>.')
  }
  return table as unknown as Table<TData>
}

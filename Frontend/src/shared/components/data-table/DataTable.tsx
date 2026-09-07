import type { Table } from '@tanstack/react-table'
import type { ReactNode } from 'react'

import { ColumnToggle } from './ColumnToggle'
import { DataTableContext } from './context'
import { EmptyState } from './EmptyState'
import { Export } from './Export'
import { FilterPills } from './FilterPills'
import { Toolbar } from './Toolbar'
import { Virtualised } from './Virtualised'

interface DataTableRootProps<TData> {
  readonly table: Table<TData>
  readonly children: ReactNode
}

function Root<TData>({ table, children }: DataTableRootProps<TData>) {
  return (
    <DataTableContext.Provider value={table as unknown as Table<unknown>}>
      <div className="grid h-full grid-rows-[auto_1fr]">{children}</div>
    </DataTableContext.Provider>
  )
}

/**
 * One table for the whole app — results, answers, suppression, call queue
 * all render through this. Explicitly typed as a plain object with
 * subcomponents attached (Object.assign), rather than relying on inference,
 * because under strict + verbatimModuleSyntax the namespace properties
 * don't type cleanly if TypeScript has to infer them.
 *
 *   <DataTable table={table}>
 *     <DataTable.Toolbar><DataTable.FilterPills/><DataTable.ColumnToggle/><DataTable.Export/></DataTable.Toolbar>
 *     <DataTable.Virtualised estimateSize={36} overscan={12}/>
 *     <DataTable.EmptyState>…</DataTable.EmptyState>
 *   </DataTable>
 */
interface DataTableComponent {
  <TData>(props: DataTableRootProps<TData>): ReactNode
  Toolbar: typeof Toolbar
  FilterPills: typeof FilterPills
  ColumnToggle: typeof ColumnToggle
  Export: typeof Export
  Virtualised: typeof Virtualised
  EmptyState: typeof EmptyState
}

export const DataTable: DataTableComponent = Object.assign(Root, {
  Toolbar,
  FilterPills,
  ColumnToggle,
  Export,
  Virtualised,
  EmptyState,
})

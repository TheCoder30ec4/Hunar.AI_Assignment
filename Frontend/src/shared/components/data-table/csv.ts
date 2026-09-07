import type { Table } from '@tanstack/react-table'

/** A leading =, +, -, or @ makes Excel/Sheets interpret the cell as a
 * formula — a CSV built from user-editable data (candidate names, company
 * names, answer text) must defuse that before it ever reaches a
 * spreadsheet, or a crafted candidate name becomes a formula injection the
 * moment someone opens the export. */
const FORMULA_INJECTION_PREFIX = /^[=+\-@]/

function escapeCsvField(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (FORMULA_INJECTION_PREFIX.test(text)) text = `'${text}`

  const needsQuoting = /[",\n\r]/.test(text)
  if (!needsQuoting) return text
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Exports visible columns, in display order, honouring selection — selected
 * rows only if any are selected, otherwise every currently-filtered row.
 * No library: a CSV is a Blob and a couple of string joins, not worth a
 * dependency.
 */
export function exportTableToCsv<TData>(table: Table<TData>, filename: string): void {
  const visibleColumns = table.getVisibleLeafColumns()
  const selectedRows = table.getFilteredSelectedRowModel().rows
  const rows = selectedRows.length > 0 ? selectedRows : table.getFilteredRowModel().rows

  const header = visibleColumns.map((column) => escapeCsvField(column.id)).join(',')
  const body = rows
    .map((row) =>
      visibleColumns
        .map((column) => escapeCsvField(row.getValue(column.id)))
        .join(','),
    )
    .join('\r\n')

  const csvContent = `${header}\r\n${body}`
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

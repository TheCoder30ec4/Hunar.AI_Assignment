import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Table } from '@tanstack/react-table'

import { exportTableToCsv } from './csv'

/**
 * exportTableToCsv's job is to build the right CSV text and hand it to the
 * browser as a download — the browser-download half (Blob, an <a> click) is
 * a couple of lines with nothing to get wrong; the escaping logic is the
 * part worth locking down. Spy on URL.createObjectURL to capture the real
 * Blob it's given, then read its text back out.
 */
function fakeTable(rows: Record<string, unknown>[], selectedRows: Record<string, unknown>[] = []) {
  const toRow = (data: Record<string, unknown>) => ({
    getValue: (columnId: string) => data[columnId],
  })

  return {
    getVisibleLeafColumns: () => Object.keys(rows[0] ?? {}).map((id) => ({ id })),
    getFilteredRowModel: () => ({ rows: rows.map(toRow) }),
    getFilteredSelectedRowModel: () => ({ rows: selectedRows.map(toRow) }),
  } as unknown as Table<unknown>
}

async function runAndCaptureCsv(table: Table<unknown>): Promise<string> {
  let capturedBlob: Blob | null = null
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    capturedBlob = blob as Blob
    return 'blob:mock'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)

  exportTableToCsv(table, 'test.csv')

  if (!capturedBlob) throw new Error('exportTableToCsv never called URL.createObjectURL')
  return await (capturedBlob as Blob).text()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportTableToCsv', () => {
  it('prefixes a leading =, +, -, or @ to defuse formula injection', async () => {
    const csv = await runAndCaptureCsv(
      fakeTable([{ name: '=cmd|"/c calc"!A1', title: '+1', company: '-1', note: '@mention' }]),
    )

    expect(csv).toContain("'=cmd")
    expect(csv).toContain("'+1")
    expect(csv).toContain("'-1")
    expect(csv).toContain("'@mention")
  })

  it('quotes and escapes fields containing commas or quotes', async () => {
    const csv = await runAndCaptureCsv(fakeTable([{ name: 'Doe, Jane', quote: 'She said "hi"' }]))

    expect(csv).toContain('"Doe, Jane"')
    expect(csv).toContain('"She said ""hi"""')
  })

  it('exports only selected rows when a selection exists', async () => {
    const allRows = [{ name: 'Alice' }, { name: 'Bob' }]
    const csv = await runAndCaptureCsv(fakeTable(allRows, [{ name: 'Alice' }]))

    expect(csv).toContain('Alice')
    expect(csv).not.toContain('Bob')
  })

  it('exports every filtered row when nothing is selected', async () => {
    const allRows = [{ name: 'Alice' }, { name: 'Bob' }]
    const csv = await runAndCaptureCsv(fakeTable(allRows, []))

    expect(csv).toContain('Alice')
    expect(csv).toContain('Bob')
  })

  it('leaves a plain value untouched', async () => {
    const csv = await runAndCaptureCsv(fakeTable([{ name: 'Alice' }]))
    expect(csv).toBe('name\r\nAlice')
  })
})

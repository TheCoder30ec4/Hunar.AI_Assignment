import { DownloadIcon } from 'lucide-react'

import { Button } from '@/shared/components/ui/button'

import { exportTableToCsv } from './csv'
import { useDataTableContext } from './context'

export function Export<TData extends { id: string }>({
  filename = 'export.csv',
}: {
  readonly filename?: string | undefined
}) {
  const table = useDataTableContext<TData>()

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => exportTableToCsv(table, filename)}
    >
      <DownloadIcon className="size-3.5" />
      Export CSV
    </Button>
  )
}

import { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { ScrollArea } from './ScrollArea'

export interface Column<T> {
  key: string
  header: string
  className?: string
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = 'No records',
  className,
  maxHeight = 'min(420px, calc(100vh - 280px))',
  rowKey,
}: {
  columns: Column<T>[]
  rows: T[]
  emptyMessage?: string
  className?: string
  maxHeight?: string
  rowKey?: (row: T, index: number) => string
}) {
  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-[11px] text-ax-text-muted border border-ax-border rounded-lg bg-ax-bg-2">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ScrollArea className={cn('border border-ax-border rounded-lg bg-ax-bg-2', className)} style={{ maxHeight }}>
      <table className="ax-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i}>
              {columns.map((col) => (
                <td key={col.key} className={col.className}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  )
}

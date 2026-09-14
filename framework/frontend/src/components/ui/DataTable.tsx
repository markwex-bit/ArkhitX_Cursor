import { ReactNode, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { ScrollArea } from './ScrollArea'

export interface Column<T> {
  key: string
  header: string
  className?: string
  sortable?: boolean
  sortValue?: (row: T) => string | number | null
  render: (row: T) => ReactNode
}

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = 'No records',
  className,
  maxHeight = 'calc(100vh - 280px)',
  rowKey,
}: {
  columns: Column<T>[]
  rows: T[]
  emptyMessage?: string
  className?: string
  maxHeight?: string
  rowKey?: (row: T, index: number) => string
}) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    const col = columns.find((c) => c.key === sortKey)
    if (!col?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : av > bv ? 1 : 0
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir, columns])

  const toggleSort = (key: string, sortable?: boolean) => {
    if (!sortable) return
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-ax-text-muted border border-ax-border rounded-lg bg-ax-bg-2">
        {emptyMessage}
      </div>
    )
  }

  return (
    <ScrollArea className={cn('border border-ax-border rounded-lg bg-ax-bg-2', className)} style={{ maxHeight }}>
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-ax-bg-3 border-b border-ax-border">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-3 py-2 text-left font-semibold text-ax-text-muted uppercase tracking-wide whitespace-nowrap',
                  col.sortable && 'cursor-pointer hover:text-ax-text select-none',
                  col.className,
                )}
                onClick={() => toggleSort(col.key, col.sortable)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row, i) : i}
              className="border-b border-ax-border/50 hover:bg-ax-bg-3/60 transition-colors"
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-3 py-2 text-ax-text align-top', col.className)}>
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

import type { ReactNode } from 'react'

export interface DataTableColumn<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
}

/**
 * Generic table on top of the prototype's `.table` styling — columns
 * describe how to render each cell, so it works for any row shape (used
 * today for Recent ticks; the same shape fits the trade tables a later
 * task will add to Backtest).
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel,
}: {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  emptyLabel?: string
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="text-muted table-empty">
              {emptyLabel ?? 'Không có dữ liệu.'}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((col) => (
                <td key={col.key} style={col.align === 'right' ? { textAlign: 'right' } : undefined}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}

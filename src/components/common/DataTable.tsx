import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react'

import { EmptyState } from './EmptyState'
import { Skeleton } from './Skeleton'
import { cn } from '@/utils/cn'

export interface Column<T> {
  /** Stable key; also the default sort key when `sortKey` is omitted. */
  key: string
  header: string
  /** Cell renderer. Receives the row and its zero-based index. */
  cell: (row: T, index: number) => ReactNode
  /** Value used for sorting. Omit to make the column unsortable. */
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right' | 'center'
  /** Hidden below the `lg` breakpoint on desktop layouts. */
  hideBelowLg?: boolean
  /** Always visible even in the compact mobile card layout. */
  primaryOnMobile?: boolean
  className?: string
  headerClassName?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  skeletonRows?: number
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  /** Enables the mobile stacked-card layout below `lg`. */
  responsive?: boolean
  defaultSort?: { key: string; direction: 'asc' | 'desc' }
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' } | null) => void
  /** Rendered under the table, typically a Pagination control. */
  footer?: ReactNode
  className?: string
  /** Caption for screen readers. */
  caption?: string
}

function compare(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Sortable, responsive data table.
 *
 * Above `lg` it renders a real `<table>` with sticky header. Below `lg` the same
 * columns collapse into stacked definition-style cards, so no information is
 * lost on a phone — no horizontal scrolling required.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading = false,
  skeletonRows = 8,
  emptyTitle = 'No results found',
  emptyDescription,
  emptyAction,
  responsive = true,
  defaultSort,
  onSortChange,
  footer,
  className,
  caption,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort ?? null)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((item) => item.key === sort.key)
    if (!column?.sortValue) return rows

    const factor = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => compare(column.sortValue!(a), column.sortValue!(b)) * factor)
  }, [rows, sort, columns])

  const toggleSort = useCallback(
    (key: string) => {
      setSort((current) => {
        let next: { key: string; direction: 'asc' | 'desc' } | null
        if (current?.key !== key) next = { key, direction: 'asc' }
        else if (current.direction === 'asc') next = { key, direction: 'desc' }
        else next = null

        onSortChange?.(next)
        return next
      })
    },
    [onSortChange],
  )

  const alignClass = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
  } as const

  if (loading) {
    return (
      <div className={cn('overflow-hidden rounded-card border border-border-base bg-surface', className)}>
        <div className="flex gap-4 border-b border-border-base bg-surface-2/60 px-4 py-3">
          {columns.map((column) => (
            <Skeleton key={column.key} className="h-3 flex-1" />
          ))}
        </div>
        <div className="divide-y divide-[var(--border)]">
          {Array.from({ length: skeletonRows }, (_, rowIndex) => (
            <div key={rowIndex} className="flex items-center gap-4 px-4 py-4">
              {columns.map((column) => (
                <Skeleton key={column.key} className="h-3.5 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={cn('rounded-card border border-border-base bg-surface', className)}>
        <EmptyState
          icon={<Inbox className="size-5" aria-hidden="true" />}
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
        {footer}
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Desktop / tablet: semantic table */}
      <div
        className={cn(
          'overflow-hidden rounded-card border border-border-base bg-surface',
          responsive && 'hidden lg:block',
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-full border-collapse text-left text-[13px]">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead>
              <tr className="border-b border-border-base bg-surface-2/60">
                {columns.map((column) => {
                  const sortable = Boolean(column.sortValue)
                  const active = sort?.key === column.key
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                      className={cn(
                        'whitespace-nowrap px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-fg-muted',
                        alignClass[column.align ?? 'left'],
                        column.hideBelowLg && 'lg:table-cell hidden',
                        column.headerClassName,
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded transition-colors hover:text-fg',
                            active && 'text-fg',
                            column.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {column.header}
                          {active ? (
                            sort.direction === 'asc' ? (
                              <ArrowUp className="size-3" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="size-3" aria-hidden="true" />
                            )
                          ) : (
                            <ChevronsUpDown
                              className="size-3 opacity-40"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {sortedRows.map((row, index) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter') onRowClick(row)
                        }
                      : undefined
                  }
                  className={cn(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-surface-2/70',
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 align-middle text-fg',
                        alignClass[column.align ?? 'left'],
                        column.hideBelowLg && 'lg:table-cell hidden',
                        column.className,
                      )}
                    >
                      {column.cell(row, index)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: stacked cards built from the same column definitions */}
      {responsive ? (
        <ul className="space-y-2.5 lg:hidden">
          {sortedRows.map((row, index) => {
            const primary = columns.filter((column) => column.primaryOnMobile)
            const rest = columns.filter((column) => !column.primaryOnMobile)
            const heading = primary[0]

            return (
              <li key={rowKey(row)}>
                <div
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  role={onRowClick ? 'button' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === 'Enter') onRowClick(row)
                        }
                      : undefined
                  }
                  className={cn(
                    'rounded-card border border-border-base bg-surface p-4',
                    onRowClick && 'cursor-pointer active:bg-surface-2',
                  )}
                >
                  {heading ? (
                    <div className="text-sm font-medium text-fg">{heading.cell(row, index)}</div>
                  ) : null}
                  <dl className={cn('mt-3 space-y-2', primary.length > 1 && 'flex flex-wrap gap-2')}>
                    {(primary.length > 1 ? primary.slice(1) : rest).map((column) => (
                      <div
                        key={column.key}
                        className={cn(
                          'flex items-start justify-between gap-3',
                          primary.length > 1 && 'min-w-0',
                        )}
                      >
                        <dt className="shrink-0 text-xs text-fg-subtle">{column.header}</dt>
                        <dd className="min-w-0 text-right text-[13px] text-fg">
                          {column.cell(row, index)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {footer}
    </div>
  )
}

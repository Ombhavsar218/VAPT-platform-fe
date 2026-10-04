import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from './Button'
import { cn } from '@/utils/cn'

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeOptions?: number[]
  className?: string
}

/**
 * Range + page controls. Shows "1–25 of 140" so the analyst always knows the
 * size of the result set, not just the current window.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-card border border-border-base bg-surface px-4 py-2.5',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <p className="text-xs text-fg-muted">
          {total === 0 ? (
            'No results'
          ) : (
            <>
              <span className="font-medium text-fg tabular-nums">
                {from}–{to}
              </span>{' '}
              of <span className="tabular-nums">{total.toLocaleString()}</span>
            </>
          )}
        </p>

        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-xs text-fg-muted">
            <span className="hidden sm:inline">Rows</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="h-7 rounded border border-border-base bg-surface-3 px-1.5 text-xs text-fg focus:border-accent-border focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <span className="min-w-20 text-center text-xs text-fg-muted tabular-nums">
          Page {page} of {totalPages}
        </span>

        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

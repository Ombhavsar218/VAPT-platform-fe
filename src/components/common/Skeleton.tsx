import type { CSSProperties } from 'react'

import { cn } from '@/utils/cn'

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
    />
  )
}

/** Placeholder matching the shape of a page header. */
export function SkeletonHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  )
}

/** Placeholder matching a grid of dashboard stat cards. */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-card border border-border-base bg-surface p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="size-8 rounded-md" />
          </div>
          <Skeleton className="mt-4 h-8 w-16" />
          <Skeleton className="mt-3 h-3 w-28" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder matching a data table with `rows` body rows. */
export function SkeletonTable({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-border-base bg-surface">
      <div className="flex gap-4 border-b border-border-base bg-surface-2/60 px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={rowIndex} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={cn('h-3.5 flex-1', columnIndex === 0 && 'max-w-[220px]')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Placeholder matching a chart panel. */
export function SkeletonChart({ height = 260 }: { height?: number }) {
  return (
    <div className="rounded-card border border-border-base bg-surface p-5">
      <Skeleton className="h-3.5 w-40" />
      <Skeleton className="mt-2 h-3 w-56" />
      <div className="mt-6 flex items-end gap-2" style={{ height }}>
        {[45, 68, 32, 80, 55, 72, 40, 62].map((percent, index) => (
          <Skeleton
            key={index}
            className="flex-1 rounded-t"
            style={{ height: `${percent}%` }}
          />
        ))}
      </div>
    </div>
  )
}

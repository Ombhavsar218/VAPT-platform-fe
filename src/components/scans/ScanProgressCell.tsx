import { ProgressBar } from '@/components/common/ProgressBar'
import { ScanStatusBadge } from '@/components/common/StatusBadge'
import type { ScanRow } from '@/services/scans'
import { isScanInFlight } from '@/utils/severity'
import { cn } from '@/utils/cn'
import { formatElapsed } from '@/utils/format'

/**
 * A scan's live state, in the width a table cell has to offer.
 *
 * Terminal runs get their duration; in-flight runs get the percentage, the stage
 * they are in and the time left, because that is the only reason anyone watches
 * a register row move.
 */

export function toneForScan(scan: Pick<ScanRow, 'status' | 'progress'>): 'accent' | 'success' | 'warning' | 'danger' | 'neutral' {
  if (scan.status === 'completed') return 'success'
  if (scan.status === 'failed') return 'danger'
  if (scan.status === 'cancelled') return 'neutral'
  if (scan.status === 'analyzing') return 'warning'
  return 'accent'
}

export function activeStageName(row: ScanRow): string | null {
  if (!isScanInFlight(row.status)) return null
  const active = row.stages.find((stage) => stage.state === 'active')
  if (active) return active.name
  return row.status === 'queued' ? 'Waiting for a worker' : null
}

export function ScanProgressCell({ row, className }: { row: ScanRow; className?: string }) {
  const live = isScanInFlight(row.status)

  if (!live) {
    return (
      <div className={cn('min-w-0', className)}>
        <ScanStatusBadge status={row.status} />
        <p className="mt-1 text-[11px] tabular-nums text-fg-subtle">
          {formatElapsed(row.durationSeconds)}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <ScanStatusBadge status={row.status} />
        <span className="text-[12px] font-semibold tabular-nums text-fg">{row.progress}%</span>
      </div>
      <ProgressBar value={row.progress} size="sm" tone={toneForScan(row)} className="mt-1.5" />
      <p className="mt-1 truncate text-[11px] tabular-nums text-fg-subtle">
        {activeStageName(row) ?? 'Starting'} · {formatElapsed(row.estimatedRemainingSeconds)} left
      </p>
    </div>
  )
}

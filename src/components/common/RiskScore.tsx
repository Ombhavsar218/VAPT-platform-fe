import { ProgressBar } from './ProgressBar'
import { cn } from '@/utils/cn'

export interface RiskScoreProps {
  /** 0–100. */
  value: number
  size?: 'sm' | 'md'
  /** Shows the numeric value beside the bar. */
  showValue?: boolean
  label?: string
  className?: string
}

function toneFor(value: number): 'danger' | 'warning' | 'accent' | 'neutral' {
  if (value >= 70) return 'danger'
  if (value >= 45) return 'warning'
  if (value >= 25) return 'accent'
  return 'neutral'
}

function bandFor(value: number): string {
  if (value >= 70) return 'Critical'
  if (value >= 45) return 'Elevated'
  if (value >= 25) return 'Moderate'
  return 'Low'
}

/**
 * Compact risk indicator.
 *
 * The score is a weighted, saturating figure rather than a finding count, so it
 * is always shown with its band name — a bare number invites the reader to treat
 * it as a raw total.
 */
export function RiskScore({ value, size = 'sm', showValue = true, label, className }: RiskScoreProps) {
  return (
    <div className={cn('min-w-24', className)}>
      <div className="flex items-baseline justify-between gap-2">
        {showValue ? (
          <span className="text-[13px] font-semibold tabular-nums text-fg">{value}</span>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-fg-subtle">{bandFor(value)}</span>
      </div>
      <ProgressBar className="mt-1" size={size} value={value} tone={toneFor(value)} label={label} />
    </div>
  )
}

/** Bare score for dense table cells. */
export function RiskScoreInline({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="w-6 shrink-0 text-[13px] font-semibold tabular-nums text-fg">{value}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-3">
        <span
          aria-hidden="true"
          className={cn(
            'block h-full rounded-full',
            value >= 70
              ? 'bg-sev-critical'
              : value >= 45
                ? 'bg-sev-high'
                : value >= 25
                  ? 'bg-accent'
                  : 'bg-fg-subtle',
          )}
          style={{ width: `${Math.max(3, Math.min(100, value))}%` }}
        />
      </span>
    </span>
  )
}

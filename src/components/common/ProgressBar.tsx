import { cn } from '@/utils/cn'

export interface ProgressBarProps {
  /** 0–100. */
  value: number
  label?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** Overrides the fill colour, e.g. to reflect severity. */
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral'
  /** Adds an indeterminate shimmer for work with no measurable progress. */
  indeterminate?: boolean
  className?: string
}

const HEIGHTS = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' } as const

const TONES = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-fg-subtle',
} as const

export function ProgressBar({
  value,
  label,
  showValue = false,
  size = 'md',
  tone = 'accent',
  indeterminate = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))

  return (
    <div className={cn('w-full', className)}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {label ? <span className="text-[13px] font-medium text-fg">{label}</span> : <span />}
          {showValue ? (
            <span className="text-[13px] font-semibold tabular-nums text-fg">
              {Math.round(clamped)}%
            </span>
          ) : null}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
        className={cn(
          'w-full overflow-hidden rounded-full bg-surface-3',
          HEIGHTS[size],
        )}
      >
        {indeterminate ? (
          <div className="h-full w-1/3 animate-[shimmer_1.4s_ease-in-out_infinite] rounded-full bg-accent" />
        ) : (
          <div
            className={cn('h-full rounded-full transition-[width] duration-500 ease-out', TONES[tone])}
            style={{ width: `${clamped}%` }}
          />
        )}
      </div>
    </div>
  )
}

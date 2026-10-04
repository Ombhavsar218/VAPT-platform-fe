import { TokenBadge, type BadgeSize, type TokenBadgeProps } from './TokenBadge'
import { SEVERITY_META, SEVERITY_RANK } from '@/utils/severity'
import type { Severity } from '@/types'

export interface SeverityBadgeProps {
  severity: Severity
  size?: BadgeSize
  dot?: boolean
  /** Hides the word and shows only the short code — for very narrow columns. */
  compact?: boolean
  className?: string
}

export function SeverityBadge({
  severity,
  size = 'sm',
  dot = true,
  compact = false,
  className,
}: SeverityBadgeProps) {
  const meta = SEVERITY_META[severity]

  if (compact) {
    return (
      <span
        title={meta.label}
        className={[
          'inline-flex items-center rounded-md border px-1.5 font-semibold tracking-wide',
          meta.text,
          meta.surface,
          meta.border,
          size === 'xs' ? 'h-5 text-[10px]' : 'h-6 text-[11px]',
          className,
        ].join(' ')}
      >
        {meta.short}
      </span>
    )
  }

  const props: TokenBadgeProps = { meta, size, dot, className }
  return <TokenBadge {...props} />
}

/**
 * A vertical severity rule used at the leading edge of finding cards, where a
 * full badge would compete with the finding title.
 */
export function SeverityRule({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'block w-1 shrink-0 rounded-full self-stretch',
        SEVERITY_META[severity].fill,
        className ?? '',
      ].join(' ')}
    />
  )
}

export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity]
}

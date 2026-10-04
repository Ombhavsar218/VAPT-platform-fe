import type { ReactNode } from 'react'

import { cn } from '@/utils/cn'
import type { TokenMeta } from '@/utils/severity'

export type BadgeSize = 'xs' | 'sm'

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: 'h-5 px-1.5 text-[11px] gap-1',
  sm: 'h-6 px-2 text-xs gap-1.5',
}

const DOT_SIZE: Record<BadgeSize, string> = {
  xs: 'size-1.5',
  sm: 'size-2',
}

export interface TokenBadgeProps {
  meta: TokenMeta
  size?: BadgeSize
  /** Coloured dot preceding the label. */
  dot?: boolean
  /** Leading icon; mutually exclusive with `dot` in practice. */
  icon?: ReactNode
  /** Dashed outline reads as "unverified" — used for potential findings. */
  dashed?: boolean
  className?: string
  title?: string
}

/**
 * Base badge driven by a `TokenMeta` record.
 *
 * Colour is never the only differentiator: every badge renders its text label,
 * and severity/status treatments can additionally carry an icon.
 */
export function TokenBadge({
  meta,
  size = 'sm',
  dot = false,
  icon,
  dashed = false,
  className,
  title,
}: TokenBadgeProps) {
  return (
    <span
      title={title ?? meta.label}
      className={cn(
        'inline-flex items-center rounded-md border font-medium whitespace-nowrap',
        meta.text,
        meta.surface,
        dashed ? cn(meta.border, 'border-dashed') : meta.border,
        SIZE_CLASSES[size],
        className,
      )}
    >
      {icon ?? (dot ? <span className={cn('rounded-full', meta.fill, DOT_SIZE[size])} /> : null)}
      {meta.label}
    </span>
  )
}

/** Bare coloured dot for legends, chart keys and dense table rows. */
export function StatusDot({ meta, className }: { meta: TokenMeta; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', meta.fill, className)}
    />
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { cn } from '@/utils/cn'

export interface StatCardProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  /** Supporting line, e.g. "3 running right now". */
  caption?: ReactNode
  /** Signed change versus the previous period. */
  delta?: { value: number; label: string; invertMeaning?: boolean }
  /** Renders the whole card as a link. */
  to?: string
  /** Optional severity accent rail along the top edge. */
  accentClassName?: string
  className?: string
}

export function StatCard({
  label,
  value,
  icon,
  caption,
  delta,
  to,
  accentClassName,
  className,
}: StatCardProps) {
  const body = (
    <>
      {accentClassName ? (
        <span
          aria-hidden="true"
          className={cn('absolute inset-x-0 top-0 h-0.5 rounded-t-card', accentClassName)}
        />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-fg-muted">{label}</p>
        {icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-base bg-surface-2 text-fg-subtle">
            {icon}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-[28px] font-semibold leading-none tracking-tight text-fg tabular-nums">
        {value}
      </p>

      {delta ? (
        <span
          className={cn(
            'mt-3 inline-flex items-center gap-1 text-xs font-medium',
            (delta.invertMeaning ? delta.value < 0 : delta.value > 0)
              ? 'text-success'
              : delta.value === 0
                ? 'text-fg-muted'
                : 'text-danger',
          )}
        >
          {delta.value > 0 ? (
            <TrendingUp className="size-3.5" aria-hidden="true" />
          ) : delta.value < 0 ? (
            <TrendingDown className="size-3.5" aria-hidden="true" />
          ) : null}
          {delta.value > 0 ? '+' : ''}
          {delta.value}
          <span className="font-normal text-fg-subtle">{delta.label}</span>
        </span>
      ) : null}

      {caption ? (
        <p className="mt-2 text-xs leading-relaxed text-fg-subtle">{caption}</p>
      ) : null}
    </>
  )

  const shell = cn(
    'relative overflow-hidden rounded-card border border-border-base bg-surface p-5',
    to && 'transition-colors duration-150 hover:border-border-strong hover:bg-surface-2',
    className,
  )

  if (to) {
    return (
      <Link to={to} className={cn(shell, 'block')}>
        {body}
      </Link>
    )
  }

  return <div className={shell}>{body}</div>
}

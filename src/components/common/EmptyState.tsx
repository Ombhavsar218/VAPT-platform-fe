import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

import { cn } from '@/utils/cn'

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  /** Secondary hint, e.g. a filter hint when the list is filtered to zero. */
  hint?: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  hint,
  size = 'md',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        size === 'md' ? 'px-6 py-14' : 'px-4 py-8',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-lg border border-border-base bg-surface-2 text-fg-subtle">
        {icon ?? <Inbox className="size-5" aria-hidden="true" />}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-fg">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-fg-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
      {hint ? <p className="mt-3 text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  )
}

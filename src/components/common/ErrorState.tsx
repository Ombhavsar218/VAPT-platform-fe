import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'

import { Button } from './Button'
import { cn } from '@/utils/cn'

export interface ErrorStateProps {
  title?: string
  /** The underlying failure message, shown verbatim so it can be reported. */
  message?: string
  onRetry?: () => void
  retryLabel?: string
  /** `offline` and `server` pick the icon; `generic` is the default. */
  variant?: 'generic' | 'offline' | 'server'
  className?: string
}

const ICONS = {
  generic: AlertTriangle,
  offline: WifiOff,
  server: AlertTriangle,
} as const

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  retryLabel = 'Try again',
  variant = 'generic',
  className,
}: ErrorStateProps) {
  const Icon = ICONS[variant]

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex size-11 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-fg">{title}</h3>
      {message ? (
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-fg-muted">{message}</p>
      ) : null}
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leadingIcon={<RefreshCw className="size-3.5" />}
          className="mt-5"
        >
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}

/** Compact inline variant for use inside a panel or table region. */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border border-danger/30 bg-danger/8 px-3.5 py-3"
    >
      <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] text-fg-muted">{message}</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

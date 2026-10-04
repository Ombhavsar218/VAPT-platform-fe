import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import type { ComponentType } from 'react'

import type { Toast, ToastVariant } from '@/hooks/useToast'
import { cn } from '@/utils/cn'

const VARIANT_META: Record<
  ToastVariant,
  { icon: ComponentType<{ className?: string }>; iconClass: string; borderClass: string }
> = {
  success: { icon: CheckCircle2, iconClass: 'text-success', borderClass: 'border-success/35' },
  error: { icon: XCircle, iconClass: 'text-danger', borderClass: 'border-danger/35' },
  warning: { icon: AlertTriangle, iconClass: 'text-warning', borderClass: 'border-warning/35' },
  info: { icon: Info, iconClass: 'text-info', borderClass: 'border-info/35' },
}

export interface ToasterProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function Toaster({ toasts, onDismiss }: ToasterProps) {
  if (toasts.length === 0) return null

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4',
        'sm:inset-x-auto sm:right-0 sm:items-end',
      )}
    >
      {toasts.map((toast) => {
        const meta = VARIANT_META[toast.variant]
        const Icon = meta.icon

        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-bg-elevated p-3.5',
              'shadow-overlay',
              meta.borderClass,
            )}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', meta.iconClass)} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-fg">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-0.5 rounded p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )
      })}
    </div>,
    document.body,
  )
}

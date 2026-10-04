import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { Button } from './Button'
import { useOverlayBehaviour } from '@/hooks/useOverlay'
import { cn } from '@/utils/cn'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: ModalSize
  /** Hides the default close button when the content provides its own. */
  hideCloseButton?: boolean
}

/**
 * Centred dialog for short, focused tasks. Prefer a dedicated page or a Drawer
 * for anything that would not comfortably fit above the fold.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideCloseButton = false,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlayBehaviour(open, panelRef, onClose)

  if (!open) return null

  const titleId = 'modal-title'

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex w-full flex-col overflow-hidden border border-border-base bg-surface shadow-overlay',
          'rounded-t-xl sm:rounded-card',
          'max-h-[92vh] sm:max-h-[88vh]',
          SIZE_CLASSES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-base px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] font-semibold tracking-tight text-fg">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{description}</p>
            ) : null}
          </div>
          {!hideCloseButton ? (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onClose}
              aria-label="Close dialog"
              className="-mr-1 -mt-1"
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-border-base bg-surface-2/60 px-5 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { Button } from './Button'
import { useOverlayBehaviour } from '@/hooks/useOverlay'
import { cn } from '@/utils/cn'

export type DrawerSide = 'right' | 'left' | 'bottom'

const SIDE_CLASSES: Record<DrawerSide, string> = {
  right: 'inset-y-0 right-0 w-full max-w-xl border-l',
  left: 'inset-y-0 left-0 w-full max-w-sm border-r',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] w-full border-t',
}

export interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  side?: DrawerSide
  widthClassName?: string
}

/**
 * Side panel for record-level detail: finding review, target inspection,
 * activity drill-down. Preferred over a modal for anything with real content.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  widthClassName,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlayBehaviour(open, panelRef, onClose)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex flex-col overflow-hidden border-border-base bg-surface shadow-overlay',
          SIDE_CLASSES[side],
          widthClassName,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-base px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
            {description ? (
              <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            onClick={onClose}
            aria-label="Close panel"
            className="-mr-1 -mt-1"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

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

import { useRef, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

import { Button } from './Button'
import { Modal } from './Modal'

export interface ConfirmationDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
}

/** Explicit confirmation for actions that mutate assessment data. */
export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
}: ConfirmationDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3.5">
        {destructive ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-danger/30 bg-danger/10 text-danger">
            <AlertTriangle className="size-4" aria-hidden="true" />
          </div>
        ) : null}
        <div className="min-w-0 pt-0.5">
          {typeof description === 'string' ? (
            <p className="text-[13px] leading-relaxed text-fg-muted">{description}</p>
          ) : (
            description
          )}
        </div>
      </div>
    </Modal>
  )
}

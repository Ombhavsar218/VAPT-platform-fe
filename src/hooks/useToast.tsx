import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { Toaster } from '@/components/common/Toaster'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  durationMs: number
}

interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  durationMs?: number
}

interface ToastContextValue {
  toast: (input: ToastInput) => string
  success: (title: string, description?: string) => string
  error: (title: string, description?: string) => string
  warning: (title: string, description?: string) => string
  info: (title: string, description?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION = 5000
const MAX_VISIBLE = 4

let toastCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const show = useCallback(
    ({ title, description, variant = 'info', durationMs = DEFAULT_DURATION }: ToastInput) => {
      toastCounter += 1
      const id = `toast-${toastCounter}`
      const entry: Toast = { id, title, description, variant, durationMs }

      setToasts((current) => [...current, entry].slice(-MAX_VISIBLE))
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      )
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => clearTimeout(timer))
      pending.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: show,
      dismiss,
      success: (title, description) => show({ title, description, variant: 'success' }),
      error: (title, description) => show({ title, description, variant: 'error' }),
      warning: (title, description) => show({ title, description, variant: 'warning' }),
      info: (title, description) => show({ title, description, variant: 'info' }),
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a <ToastProvider>')
  }
  return context
}

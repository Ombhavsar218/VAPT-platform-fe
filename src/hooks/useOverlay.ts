import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  )
}

function cycleFocus(container: HTMLElement, event: KeyboardEvent): void {
  const focusable = focusableWithin(container)
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return

  const active = document.activeElement

  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

/**
 * Shared overlay behaviour for Modal and Drawer:
 *  - Escape to dismiss
 *  - Tab focus trapping
 *  - background scroll lock
 *  - focus restoration on close
 */
export function useOverlayBehaviour<T extends HTMLElement>(
  open: boolean,
  panelRef: RefObject<T | null>,
  onClose: () => void,
): void {
  const savedClose = useRef(onClose)

  useEffect(() => {
    // Keep the latest callback without re-running the effect on every render.
    savedClose.current = onClose
  })

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        savedClose.current()
        return
      }
      if (event.key === 'Tab' && panelRef.current) {
        cycleFocus(panelRef.current, event)
      }
    }

    document.addEventListener('keydown', onKeyDown)

    // Move focus into the panel once it is in the DOM.
    const focusFrame = window.requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const target = focusableWithin(panel)[0] ?? panel
      target.focus({ preventScroll: true })
    })

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      window.cancelAnimationFrame(focusFrame)
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open, panelRef])
}

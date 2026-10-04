import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Sidebar } from './Sidebar'
import { useOverlayBehaviour } from '@/hooks/useOverlay'

/**
 * Mobile navigation drawer. Rendered in a portal above the app with a backdrop
 * and focus trap, dismissed by Escape, backdrop click, or route change.
 */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlayBehaviour(open, panelRef, onClose)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div ref={panelRef} className="fixed inset-y-0 left-0" tabIndex={-1}>
        <Sidebar variant="mobile" onClose={onClose} onNavigate={onClose} />
      </div>
    </div>,
    document.body,
  )
}

/** Wires the mobile drawer to its trigger button. */
export function useMobileNav() {
  const [open, setOpen] = useState(false)

  const openNav = useCallback(() => setOpen(true), [])
  const closeNav = useCallback(() => setOpen(false), [])

  // Close automatically when the viewport grows past the `lg` breakpoint.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)')
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeNav()
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [closeNav])

  return { open, openNav, closeNav }
}

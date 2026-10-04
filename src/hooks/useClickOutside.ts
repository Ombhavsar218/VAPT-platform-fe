import { useEffect, useRef, type RefObject } from 'react'

/**
 * Calls `handler` when a pointer or focus event lands outside the ref.
 * Used by Dropdown, Drawer and popover-style menus.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled = true,
): void {
  const savedHandler = useRef(handler)

  useEffect(() => {
    // Keep the latest callback without re-subscribing on every render.
    savedHandler.current = handler
  })

  useEffect(() => {
    if (!enabled) return

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const element = ref.current
      if (!element) return
      if (!element.contains(event.target as Node)) savedHandler.current()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [ref, enabled])
}

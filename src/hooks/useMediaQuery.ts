import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribe to a CSS media query.
 *
 * `matchMedia` is an external store, so `useSyncExternalStore` is the correct
 * primitive: it avoids a setState-in-effect round trip and stays correct when
 * several components observe the same query.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onStoreChange)
      return () => list.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** Tailwind's `lg` breakpoint — the point where the desktop table layout applies. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}

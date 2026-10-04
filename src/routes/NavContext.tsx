import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type NavBadgeKey = 'openFindings' | 'pendingVerification' | 'runningScans'

type NavCounts = Partial<Record<NavBadgeKey, number>>

interface NavCountsContextValue {
  counts: NavCounts
  setCounts: (counts: NavCounts) => void
}

const NavCountsContext = createContext<NavCountsContextValue>({
  counts: {},
  setCounts: () => undefined,
})

/**
 * Live counts behind the sidebar badges and the topbar scan pill.
 *
 * The shell owns this state and feeds it from the workspace-counts query, so the
 * navigation config never imports data and every route shows the same numbers.
 */
export function NavCountsProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<NavCounts>({})

  const value = useMemo<NavCountsContextValue>(() => ({ counts, setCounts }), [counts])

  return <NavCountsContext.Provider value={value}>{children}</NavCountsContext.Provider>
}

export function useNavCounts(): NavCounts {
  return useContext(NavCountsContext).counts
}

export function useSetNavCounts(): (counts: NavCounts) => void {
  return useContext(NavCountsContext).setCounts
}

/* -------------------------------------------------------------------------- */
/* Sidebar collapse preference                                                  */
/* -------------------------------------------------------------------------- */

const SIDEBAR_STORAGE_KEY = 'vaptflow:sidebar-collapsed'

const SidebarContext = createContext<{ collapsed: boolean; setCollapsed: (v: boolean) => void }>({
  collapsed: false,
  setCollapsed: () => undefined,
})

export function SidebarPreferenceProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed))
    } catch {
      /* preference is session-only when storage is blocked */
    }
  }, [collapsed])

  const value = useMemo(
    () => ({ collapsed, setCollapsed: setCollapsedState }),
    [collapsed],
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}

export function useSidebarPreference() {
  return useContext(SidebarContext)
}

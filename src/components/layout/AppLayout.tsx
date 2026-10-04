import { useEffect, useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { Breadcrumbs } from './Breadcrumbs'
import { MobileNav, useMobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { useWorkspaceCounts } from '@/hooks/useWorkspaceCounts'
import { useSetNavCounts } from '@/routes/NavContext'
import { cn } from '@/utils/cn'

/** Keeps the browser tab title in step with the route. */
function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title
      ? `${title} · VAPTFlow`
      : 'VAPTFlow — Automated Web Security Testing & VAPT Management'
  }, [title])
}

export interface AppLayoutProps {
  /** Page name shown in the document title. */
  title?: string
  /** Maps route segments to real entity names, e.g. `{ 'prj-004': 'E-Commerce…' }`. */
  breadcrumbOverrides?: Record<string, string>
  /** Constrains the main column on very wide displays; report preview opts out. */
  contained?: boolean
}

export function AppLayout({
  title,
  breadcrumbOverrides,
  contained = true,
}: AppLayoutProps) {
  const { open, openNav, closeNav } = useMobileNav()
  const location = useLocation()

  const counts = useWorkspaceCounts()
  const setNavCounts = useSetNavCounts()

  useDocumentTitle(title)

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    closeNav()
  }, [closeNav, location.pathname])

  // The shell owns the badge counts so every route renders the same numbers.
  const navCounts = useMemo(
    () => ({
      openFindings: counts?.openFindings,
      pendingVerification: counts?.pendingVerification,
      runningScans: counts?.runningScans,
    }),
    [counts?.openFindings, counts?.pendingVerification, counts?.runningScans],
  )

  useEffect(() => {
    setNavCounts(navCounts)
  }, [setNavCounts, navCounts])

  useEffect(() => {
    return () => setNavCounts({})
  }, [setNavCounts])

  return (
    <div className="flex min-h-dvh bg-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-fg"
      >
        Skip to main content
      </a>

      <div className="sticky top-0 hidden h-dvh shrink-0 lg:block">
        <Sidebar />
      </div>

      <MobileNav open={open} onClose={closeNav} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={openNav} runningScans={navCounts.runningScans ?? 0} />

        <main id="main-content" className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className={cn(contained && 'mx-auto w-full max-w-[1600px]')}>
            <Breadcrumbs overrides={breadcrumbOverrides} className="mb-4" />
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

import { Fragment, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

import { cn } from '@/utils/cn'

export interface Crumb {
  label: string
  to?: string
}

/**
 * Derives a breadcrumb trail from the current route.
 *
 * Route segments are title-cased and resolved to real hrefs, so deep links such
 * as `/projects/prj-004` produce a clickable trail without every page having to
 * declare one. `overrides` lets a page supply a real name for an opaque id.
 */
export function Breadcrumbs({
  overrides = {},
  rootLabel = 'Dashboard',
  rootTo = '/dashboard',
  className,
}: {
  overrides?: Record<string, string>
  rootLabel?: string
  rootTo?: string
  className?: string
}) {
  const { pathname } = useLocation()
  const params = useParams()

  const segments = pathname.split('/').filter(Boolean)

  const crumbs: Crumb[] = [{ label: rootLabel, to: rootTo }]

  let accumulated = ''
  for (const segment of segments) {
    accumulated += `/${segment}`
    const value =
      overrides[segment] ??
      Object.values(params).find((param) => param === segment) ??
      null

    const label =
      overrides[segment] ??
      (value ? value : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '))

    crumbs.push({ label, to: accumulated })
  }

  if (crumbs.length <= 1) return null

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-[13px]">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1

          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li className="flex min-w-0 items-center">
                {crumb.to && !isLast ? (
                  <Link
                    to={crumb.to}
                    className="flex items-center gap-1.5 truncate rounded text-fg-muted transition-colors hover:text-fg"
                  >
                    {index === 0 ? <Home className="size-3.5" aria-hidden="true" /> : null}
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? 'page' : undefined}
                    className={cn('truncate', isLast ? 'font-medium text-fg' : 'text-fg-muted')}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden="true" className="flex items-center text-fg-subtle">
                  <ChevronRight className="size-3.5" />
                </li>
              ) : null}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

/** Slot for pages that need custom trailing content in the breadcrumb row. */
export function BreadcrumbRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '@/utils/cn'

export interface PageHeaderProps {
  title: string
  description?: string
  /** Primary/secondary actions rendered on the right, wrapping on small screens. */
  actions?: ReactNode
  /** Breadcrumb or contextual meta line rendered under the description. */
  meta?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-[22px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-fg-muted">
            {description}
          </p>
        ) : null}
        {meta ? <div className="mt-3">{meta}</div> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

/** Section heading used inside long pages, below the page header. */
export function SectionHeading({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Key/value row used across detail pages. */
export function DescriptionRow({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-3 sm:gap-4', className)}>
      <dt className="text-[13px] text-fg-muted sm:col-span-1">{label}</dt>
      <dd className="min-w-0 text-[13px] text-fg sm:col-span-2">{children}</dd>
    </div>
  )
}

/** Inline "view all" affordance used at the bottom of dashboard panels. */
export function ViewAllLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
    >
      {children}
    </Link>
  )
}

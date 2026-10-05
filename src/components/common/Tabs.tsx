import { useId, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/utils/cn'

export interface TabItem {
  id: string
  label: string
  count?: number
  icon?: ReactNode
}

/* -------------------------------------------------------------------------- */
/* Local tabs — for in-page view switching (no URL change)                     */
/* -------------------------------------------------------------------------- */

export interface TabsProps {
  items: TabItem[]
  value: string
  onChange: (id: string) => void
  className?: string
  /** Renders a count chip, e.g. the number of open findings on a tab. */
  showCounts?: boolean
  /**
   * Wires the tabs to panels rendered elsewhere. When set, each tab is given
   * `id={`${idPrefix}-tab-${item.id}`}` and `aria-controls={`${idPrefix}-panel-${item.id}`}`,
   * so a panel can point back at its tab with `aria-labelledby`. Omit it when the
   * tablist has no associated panels.
   */
  idPrefix?: string
}

export function Tabs({ items, value, onChange, className, showCounts = true, idPrefix }: TabsProps) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.id === value)
    if (index === -1) return

    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1

    if (nextIndex === null) return
    event.preventDefault()
    const next = items[nextIndex]
    if (next) onChange(next.id)
  }

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      className={cn('flex gap-1 overflow-x-auto border-b border-border-base', className)}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.id}` : undefined}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
              'transition-colors duration-150',
              active
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {item.icon}
            {item.label}
            {showCounts && item.count !== undefined ? (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                  active ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-fg-muted',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Router tabs — for page-level navigation that must be linkable                */
/* -------------------------------------------------------------------------- */

export interface TabNavProps {
  items: TabItem[]
  /** Current pathname; each item's `id` is matched against the active prefix. */
  pathname: string
  /** Builds the href for a tab id. */
  buildHref: (id: string) => string
  /** Ids that should be matched as prefixes of the pathname. */
  matchPrefix?: boolean
  className?: string
  showCounts?: boolean
}

export function TabNav({
  items,
  pathname,
  buildHref,
  matchPrefix = true,
  className,
  showCounts = true,
}: TabNavProps) {
  const isActive = (id: string) => {
    const href = buildHref(id)
    return matchPrefix ? pathname === href || pathname.startsWith(`${href}/`) : pathname === href
  }

  return (
    <nav
      aria-label="Section"
      className={cn('flex gap-1 overflow-x-auto border-b border-border-base', className)}
    >
      {items.map((item) => {
        const active = isActive(item.id)
        return (
          <NavLink
            key={item.id}
            to={buildHref(item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium',
              'transition-colors duration-150',
              active
                ? 'border-accent text-fg'
                : 'border-transparent text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            {item.icon}
            {item.label}
            {showCounts && item.count !== undefined ? (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
                  active ? 'bg-accent-soft text-accent-text' : 'bg-surface-2 text-fg-muted',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </NavLink>
        )
      })}
    </nav>
  )
}

/* -------------------------------------------------------------------------- */
/* Segmented control — for compact binary choices such as theme                 */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}) {
  const name = useId()

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border-base bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            name={name}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-medium',
              'transition-colors duration-150',
              active
                ? 'bg-surface text-fg shadow-xs'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/** Uncontrolled wrapper for simple in-page tab sets. */
export function useTabs(initial: string) {
  const [value, setValue] = useState(initial)
  return { value, setValue }
}

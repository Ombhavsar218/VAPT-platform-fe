import { useState, type ReactNode } from 'react'
import { ListFilter, RotateCcw } from 'lucide-react'

import { SearchBar } from './SearchBar'
import { Select, type SelectOption } from './Form'
import { Button } from './Button'
import { cn } from '@/utils/cn'

export interface FilterSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  allLabel?: string
  className?: string
}

/** A labelled dropdown filter. Pass `value=""` to represent "All". */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
  className,
}: FilterSelectProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <label className="sr-only" htmlFor={`filter-${label}`}>
        {label}
      </label>
      <Select
        id={`filter-${label}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        options={[{ value: '', label: `${label}: ${allLabel}` }, ...options]}
        className="h-8 text-[13px]"
      />
    </div>
  )
}

export interface FilterChipProps {
  label: string
  value: string
  onRemove: () => void
}

export function FilterChip({ label, value, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-accent-border bg-accent-soft py-1 pl-2.5 pr-1.5 text-xs text-fg">
      <span className="text-fg-muted">{label}</span>
      <span className="font-medium">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <RotateCcw className="size-3" />
      </button>
    </span>
  )
}

export interface FilterBarProps {
  search?: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }
  children?: ReactNode
  /** Number of non-default filters currently applied. */
  activeCount?: number
  onClear?: () => void
  /** Right-aligned slot for view toggles, export buttons, etc. */
  right?: ReactNode
  className?: string
}

/**
 * Horizontal filter strip. On mobile the filter controls collapse behind a
 * "Filters" disclosure so the search field stays usable on a phone.
 */
export function FilterBar({
  search,
  children,
  activeCount = 0,
  onClear,
  right,
  className,
}: FilterBarProps) {
  const [expanded, setExpanded] = useState(false)
  const hasFilters = Boolean(children)

  return (
    <div className={cn('rounded-card border border-border-base bg-surface p-3', className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        {search ? (
          <SearchBar
            value={search.value}
            onChange={search.onChange}
            placeholder={search.placeholder}
            label={search.label}
            size="sm"
            className="min-w-0 flex-1 sm:max-w-xs"
          />
        ) : null}

        {hasFilters ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            leadingIcon={<ListFilter className="size-3.5" />}
            className="lg:hidden"
          >
            Filters
            {activeCount > 0 ? (
              <span className="ml-0.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg">
                {activeCount}
              </span>
            ) : null}
          </Button>
        ) : null}

        <div
          className={cn(
            'flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-1',
            !expanded && 'hidden lg:flex',
          )}
        >
          {children}
        </div>

        {onClear && activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            leadingIcon={<RotateCcw className="size-3.5" />}
            className="hidden lg:inline-flex"
          >
            Clear
          </Button>
        ) : null}

        {right ? <div className="ml-auto flex items-center gap-2">{right}</div> : null}
      </div>

      {onClear && activeCount > 0 && expanded ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          leadingIcon={<RotateCcw className="size-3.5" />}
          className="mt-2.5 lg:hidden"
        >
          Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
        </Button>
      ) : null}
    </div>
  )
}

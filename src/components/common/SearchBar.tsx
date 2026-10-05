import { Search, X } from 'lucide-react'
import { useId, type ChangeEvent } from 'react'

import { cn } from '@/utils/cn'

export interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Accessible label; defaults to "Search". */
  label?: string
  className?: string
  size?: 'sm' | 'md'
  autoFocus?: boolean
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search',
  label = 'Search',
  className,
  size = 'md',
  autoFocus = false,
}: SearchBarProps) {
  const id = useId()

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle',
          size === 'sm' ? 'size-3.5' : 'size-4',
        )}
      />
      <input
        id={id}
        type="search"
        role="searchbox"
        value={value}
        autoFocus={autoFocus}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-md border border-control-border bg-surface-3 text-fg placeholder:text-fg-subtle',
          'transition-colors duration-150 hover:border-border-strong',
          'focus:border-accent',
          '[&::-webkit-search-cancel-button]:appearance-none',
          size === 'sm' ? 'h-8 pl-8.5 pr-8 text-[13px]' : 'h-9 pl-9 pr-9 text-sm',
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

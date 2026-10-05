import { useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { useClickOutside } from '@/hooks/useClickOutside'
import { cn } from '@/utils/cn'

export interface DropdownItem {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
  /** Renders a check and marks the item selected. */
  selected?: boolean
}

export interface DropdownProps {
  /** Receives `open`/`toggle` so the trigger can reflect state. */
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode
  items: DropdownItem[]
  align?: 'start' | 'end'
  menuClassName?: string
  ariaLabel?: string
}

/**
 * Lightweight menu. Closes on outside click, Escape, or selection, and moves
 * focus between items with the arrow keys.
 */
export function Dropdown({
  trigger,
  items,
  align = 'end',
  menuClassName,
  ariaLabel = 'Open menu',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useClickOutside(containerRef, () => setOpen(false), open)

  const close = () => setOpen(false)

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const enabledIndexes = items
      .map((item, index) => (item.disabled ? -1 : index))
      .filter((index) => index !== -1)

    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (enabledIndexes.length === 0) return

    const currentIndex = enabledIndexes.findIndex(
      (index) => itemRefs.current[index] === document.activeElement,
    )

    let targetPosition: number | null = null
    if (event.key === 'ArrowDown') {
      targetPosition = currentIndex === -1 ? 0 : (currentIndex + 1) % enabledIndexes.length
    } else if (event.key === 'ArrowUp') {
      targetPosition =
        currentIndex === -1
          ? enabledIndexes.length - 1
          : (currentIndex - 1 + enabledIndexes.length) % enabledIndexes.length
    }

    if (targetPosition === null) return
    event.preventDefault()
    const target = enabledIndexes[targetPosition]
    if (target !== undefined) itemRefs.current[target]?.focus()
  }

  return (
    <div ref={containerRef} className="relative">
      {trigger({ open, toggle: () => setOpen((value) => !value) })}

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div
            role="menu"
            aria-label={ariaLabel}
            onKeyDown={onMenuKeyDown}
            className={cn(
              'absolute z-20 mt-1.5 min-w-52 overflow-hidden rounded-lg border border-border-base',
              'bg-bg-elevated p-1 shadow-overlay',
              align === 'end' ? 'right-0' : 'left-0',
              menuClassName,
            )}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                ref={(node) => {
                  itemRefs.current[index] = node
                }}
                role="menuitem"
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onSelect()
                  close()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-left text-[13px]',
                  'transition-colors duration-100 disabled:pointer-events-none disabled:opacity-40',
                  item.destructive
                    ? 'text-danger hover:bg-danger/12'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
                <span className="flex-1 truncate">{item.label}</span>
                {item.selected ? <Check className="size-3.5 shrink-0 text-accent-text" /> : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Trigger button matching the standard menu affordance. */
export function DropdownTrigger({
  open,
  toggle,
  children,
  icon,
  ariaLabel,
}: {
  open: boolean
  toggle: () => void
  children?: ReactNode
  icon?: ReactNode
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md border border-border-base bg-surface-2 px-3',
        'text-sm font-medium text-fg transition-colors duration-150',
        'hover:border-border-strong hover:bg-surface-3',
      )}
    >
      {icon}
      {children}
      <ChevronDown
        className={cn('size-3.5 text-fg-subtle transition-transform duration-150', open && 'rotate-180')}
      />
    </button>
  )
}

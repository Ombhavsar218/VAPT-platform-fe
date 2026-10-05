import { NavLink } from 'react-router-dom'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'

import { LogoMark } from '@/components/common/Logo'
import { NAV_SECTIONS } from '@/routes/navigation'
import { useNavCounts, useSidebarPreference } from '@/routes/NavContext'
import { cn } from '@/utils/cn'

interface SidebarProps {
  /** Mobile drawer variant — always expanded, with a close button. */
  variant?: 'desktop' | 'mobile'
  onNavigate?: () => void
  onClose?: () => void
}

function NavItems({
  collapsed,
  counts,
  onNavigate,
}: {
  collapsed: boolean
  counts: Partial<Record<'openFindings' | 'pendingVerification', number>>
  onNavigate?: () => void
}) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id}>
          {section.label ? (
            <p
              className={cn(
                'mb-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle',
                collapsed && 'lg:sr-only',
              )}
            >
              {section.label}
            </p>
          ) : null}

          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon
              const count = item.badgeKey ? counts[item.badgeKey] : undefined

              return (
                <li key={item.id}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    title={collapsed ? item.label : item.hint}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium',
                        'transition-colors duration-150',
                        isActive
                          ? 'bg-accent-soft text-fg'
                          : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                        collapsed && 'lg:justify-center lg:px-0',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          aria-hidden="true"
                          className={cn(
                            'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent transition-opacity',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <Icon
                          className={cn(
                            'size-4 shrink-0 transition-colors',
                            isActive ? 'text-accent-text' : 'text-fg-subtle group-hover:text-fg-muted',
                          )}
                        />
                        <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>

                        {count !== undefined && count > 0 ? (
                          <span
                            className={cn(
                              'ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                              'bg-surface-2 text-fg-muted group-hover:bg-surface-3',
                              collapsed && 'lg:absolute lg:right-1.5 lg:top-1.5 lg:ml-0',
                            )}
                          >
                            {count > 99 ? '99+' : count}
                          </span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function Sidebar({ variant = 'desktop', onNavigate, onClose }: SidebarProps) {
  const { collapsed, setCollapsed } = useSidebarPreference()
  const counts = useNavCounts()
  const isMobile = variant === 'mobile'
  const isCollapsed = !isMobile && collapsed

  return (
    <div
      className={cn(
        'flex h-full flex-col border-border-base bg-surface',
        isMobile ? 'w-[280px] border-r shadow-overlay' : 'border-r',
        isCollapsed ? 'w-[68px]' : 'w-[248px]',
      )}
    >
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-border-base',
          isCollapsed && !isMobile ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        {isCollapsed && !isMobile ? (
          <NavLink to="/dashboard" aria-label="VAPTFlow dashboard" className="rounded-md">
            <LogoMark />
          </NavLink>
        ) : (
          <NavLink
            to="/dashboard"
            aria-label="VAPTFlow dashboard"
            className="flex items-center gap-2.5 rounded-md"
          >
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight text-fg">
              VAPT<span className="text-accent-text">Flow</span>
            </span>
          </NavLink>
        )}

        {isMobile ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <NavItems collapsed={isCollapsed} counts={counts} onNavigate={onNavigate} />

      {!isMobile ? (
        <div className="shrink-0 border-t border-border-base p-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium',
              'text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                Collapse
              </>
            )}
          </button>
        </div>
      ) : null}
    </div>
  )
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  Laptop,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Radar,
  Search,
  Settings,
  Sun,
  User as UserIcon,
} from 'lucide-react'

import { Dropdown, DropdownTrigger } from '@/components/common/Dropdown'
import { Logo } from '@/components/common/Logo'
import { Button } from '@/components/common/Button'
import { useAuth } from '@/hooks/useAuth'
import { useTheme, type ThemeMode } from '@/hooks/useTheme'
import { cn } from '@/utils/cn'
import { initials } from '@/utils/format'
import { listFilterHref } from '@/utils/listQuery'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export interface TopbarProps {
  onOpenNav: () => void
  /** Live running-scan count, surfaced as a persistent status pill. */
  runningScans?: number
}

export function Topbar({ onOpenNav, runningScans = 0 }: TopbarProps) {
  const { mode, setMode } = useTheme()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    navigate(`/findings?q=${encodeURIComponent(trimmed)}`)
    setQuery('')
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border-base bg-bg/85 px-4 backdrop-blur-md sm:px-6">
      <Button
        variant="ghost"
        size="iconSm"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="lg:hidden"
      >
        <Menu className="size-4" />
      </Button>

      <Link to="/dashboard" aria-label="VAPTFlow dashboard" className="lg:hidden">
        <Logo size="sm" />
      </Link>

      <form onSubmit={submitSearch} role="search" className="hidden min-w-0 flex-1 md:block">
        <label htmlFor="global-search" className="sr-only">
          Search findings, targets and projects
        </label>
        <div className="relative max-w-md">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          />
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search findings, targets, projects"
            className={cn(
              'h-9 w-full rounded-md border border-border-base bg-surface-2 pl-9 pr-14 text-sm text-fg',
              'placeholder:text-fg-subtle transition-colors duration-150',
              'hover:border-border-strong focus:border-accent-border focus:bg-surface-3 focus:outline-none focus:ring-2 focus:ring-accent/30',
              '[&::-webkit-search-cancel-button]:appearance-none',
            )}
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border-base bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle">
            /
          </kbd>
        </div>
      </form>

      <div className="ml-auto flex items-center gap-1.5">
        {runningScans > 0 ? (
          <Link
            to={listFilterHref('/scans', { status: 'running' })}
            className={cn(
              'hidden items-center gap-2 rounded-md border border-accent-border bg-accent-soft px-2.5 py-1.5',
              'text-xs font-medium text-accent transition-colors hover:bg-accent/20 sm:inline-flex',
            )}
          >
            <Radar className="size-3.5" aria-hidden="true" />
            {runningScans} scan{runningScans === 1 ? '' : 's'} running
          </Link>
        ) : null}

        <Dropdown
          ariaLabel="Appearance"
          trigger={({ open, toggle }) => (
            <DropdownTrigger open={open} toggle={toggle} icon={<Sun className="size-4 text-fg-subtle" />} ariaLabel="Change theme">
              <span className="hidden sm:inline">
                {THEME_OPTIONS.find((option) => option.value === mode)?.label ?? 'Theme'}
              </span>
            </DropdownTrigger>
          )}
          items={THEME_OPTIONS.map((option) => ({
            id: option.value,
            label: option.label,
            icon: <option.icon className="size-3.5" />,
            selected: mode === option.value,
            onSelect: () => setMode(option.value),
          }))}
        />

        <Button variant="ghost" size="iconSm" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-accent" aria-hidden="true" />
        </Button>

        <Dropdown
          ariaLabel="Account"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-haspopup="menu"
              aria-expanded={open}
              className="ml-0.5 flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-surface-2"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-accent-soft text-[11px] font-semibold text-accent">
                {initials(user?.name ?? 'Guest User')}
              </span>
              <span className="hidden text-left lg:block">
                <span className="block text-[13px] font-medium leading-tight text-fg">
                  {user?.name ?? 'Guest User'}
                </span>
                <span className="block text-[11px] capitalize leading-tight text-fg-subtle">
                  {user?.role.replace('_', ' ') ?? 'viewer'}
                </span>
              </span>
            </button>
          )}
          items={[
            {
              id: 'profile',
              label: 'Profile',
              icon: <UserIcon className="size-3.5" />,
              onSelect: () => navigate('/settings?section=profile'),
            },
            {
              id: 'settings',
              label: 'Workspace settings',
              icon: <Settings className="size-3.5" />,
              onSelect: () => navigate('/settings'),
            },
            {
              id: 'sessions',
              label: 'Active sessions',
              icon: <Laptop className="size-3.5" />,
              onSelect: () => navigate('/settings?section=security'),
            },
            {
              id: 'logout',
              label: 'Sign out',
              icon: <LogOut className="size-3.5" />,
              destructive: true,
              onSelect: handleLogout,
            },
          ]}
        />
      </div>
    </header>
  )
}

import { NavLink, Outlet } from 'react-router-dom'
import { Activity, ClipboardList, Cpu, ScrollText, Users } from 'lucide-react'

/**
 * Administration shell (`/admin/*`).
 *
 * The five screens answer one question each — is the workspace healthy, who is
 * in it, what is installed, what is running, and what has already happened — so
 * the sub-navigation is a list of those questions rather than a generic sidebar.
 */
const ADMIN_LINKS = [
  { to: '/admin', end: true, label: 'Overview', icon: Activity },
  { to: '/admin/users', end: false, label: 'Users', icon: Users },
  { to: '/admin/modules', end: false, label: 'Module registry', icon: Cpu },
  { to: '/admin/jobs', end: false, label: 'Jobs', icon: ClipboardList },
  { to: '/admin/audit-logs', end: false, label: 'Audit logs', icon: ScrollText },
] as const

export function AdminLayout() {
  return (
    <div className="space-y-5">
      <nav aria-label="Administration" className="overflow-x-auto">
        <ul className="flex min-w-max items-center gap-1 border-b border-border-base">
          {ADMIN_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ' +
                    (isActive
                      ? 'border-accent text-fg'
                      : 'border-transparent text-fg-muted hover:text-fg')
                  }
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {link.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      <Outlet />
    </div>
  )
}

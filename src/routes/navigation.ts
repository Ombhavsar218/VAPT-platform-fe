import {
  Blocks,
  Bug,
  ClipboardCheck,
  Crosshair,
  FileText,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  Radar,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  to: string
  icon: LucideIcon
  /** Match the path exactly instead of as a prefix. */
  end?: boolean
  /**
   * When present, the sidebar renders a count chip resolved from the live demo
   * store. Keeps navigation state honest without hard-coding numbers here.
   */
  badgeKey?: 'openFindings' | 'pendingVerification'
  /** Short explanation shown as a tooltip when the sidebar is collapsed. */
  hint?: string
}

export interface NavSection {
  id: string
  label: string | null
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'workspace',
    label: null,
    items: [
      { id: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, end: true },
      { id: 'projects', label: 'Projects', to: '/projects', icon: FolderKanban },
      { id: 'targets', label: 'Targets', to: '/targets', icon: Crosshair },
      { id: 'scans', label: 'Scans', to: '/scans', icon: Radar },
      {
        id: 'findings',
        label: 'Findings',
        to: '/findings',
        icon: Bug,
        badgeKey: 'openFindings',
        hint: 'Findings awaiting analyst action',
      },
      {
        id: 'verification',
        label: 'Verification',
        to: '/verification',
        icon: ClipboardCheck,
        badgeKey: 'pendingVerification',
        hint: 'Potential issues awaiting human verification',
      },
      { id: 'reports', label: 'Reports', to: '/reports', icon: FileText },
      { id: 'coverage', label: 'OWASP Coverage', to: '/coverage', icon: Gauge },
      { id: 'modules', label: 'Scanner Modules', to: '/modules', icon: Blocks },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      {
        id: 'admin',
        label: 'Administration',
        to: '/admin',
        icon: ShieldCheck,
        hint: 'Users, jobs, modules and audit logs',
      },
      { id: 'settings', label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
]

/** Flat lookup used by breadcrumbs and the mobile drawer. */
export const NAV_ITEMS_BY_ID: Record<string, NavItem> = Object.fromEntries(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.id, item])),
)

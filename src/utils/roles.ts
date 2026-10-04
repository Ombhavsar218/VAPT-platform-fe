import type { UserRole } from '@/types'

/** Human-facing role names, used by filters, tables and audit summaries. */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  lead_analyst: 'Lead analyst',
  analyst: 'Analyst',
  viewer: 'Viewer',
}

/**
 * Roles allowed into `/admin`.
 *
 * Admins own the workspace, lead analysts own delivery, so both need the fleet
 * and member views. Analysts and viewers have no administrative surface.
 */
export const ADMIN_ROLES = ['admin', 'lead_analyst'] as const satisfies readonly UserRole[]

/** True when the role may reach the administration branch. */
export function canAdminister(role: UserRole): boolean {
  return (ADMIN_ROLES as readonly UserRole[]).includes(role)
}

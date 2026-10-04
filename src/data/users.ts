import type { Organization, User, UserRole } from '@/types'
import { isoAgo, paddedId } from './seed'

/**
 * People in the demo workspace.
 *
 * Ids follow the same `usr-001` scheme as `DEMO_USER` in `useAuth`, so the signed-in
 * identity always resolves to a real member of the workspace.
 */

export const ORGANIZATIONS: Organization[] = [
  { id: 'org-001', name: 'VAPTFlow Security', slug: 'vaptflow' },
  { id: 'org-002', name: 'Meridian Assurance', slug: 'meridian' },
]

interface UserSeed {
  name: string
  email: string
  role: UserRole
  status: User['status']
  mfaEnabled: boolean
  /** Hours since the member was last seen; 0 means "right now". */
  lastActiveHoursAgo: number
}

const USER_SEEDS: UserSeed[] = [
  {
    name: 'Aarav Reddy',
    email: 'aarav.reddy@vaptflow.io',
    role: 'lead_analyst',
    status: 'active',
    mfaEnabled: true,
    lastActiveHoursAgo: 0,
  },
  {
    name: 'Meera Krishnan',
    email: 'meera.krishnan@vaptflow.io',
    role: 'admin',
    status: 'active',
    mfaEnabled: true,
    lastActiveHoursAgo: 3,
  },
  {
    name: 'Daniel Okoye',
    email: 'daniel.okoye@vaptflow.io',
    role: 'lead_analyst',
    status: 'active',
    mfaEnabled: true,
    lastActiveHoursAgo: 6,
  },
  {
    name: 'Sofia Marchetti',
    email: 'sofia.marchetti@vaptflow.io',
    role: 'analyst',
    status: 'active',
    mfaEnabled: true,
    lastActiveHoursAgo: 11,
  },
  {
    name: 'Ravi Chandrasekar',
    email: 'ravi.chandrasekar@vaptflow.io',
    role: 'analyst',
    status: 'active',
    mfaEnabled: false,
    lastActiveHoursAgo: 20,
  },
  {
    name: 'Hana Kobayashi',
    email: 'hana.kobayashi@vaptflow.io',
    role: 'analyst',
    status: 'active',
    mfaEnabled: true,
    lastActiveHoursAgo: 31,
  },
  {
    name: 'Lucas Ferreira',
    email: 'lucas.ferreira@vaptflow.io',
    role: 'analyst',
    status: 'active',
    mfaEnabled: true,
    lastActiveHoursAgo: 52,
  },
  {
    name: 'Grace Adeyemi',
    email: 'grace.adeyemi@vaptflow.io',
    role: 'viewer',
    status: 'active',
    mfaEnabled: true,
    lastActiveHoursAgo: 74,
  },
  {
    name: 'Tom Whitaker',
    email: 'tom.whitaker@vaptflow.io',
    role: 'viewer',
    status: 'invited',
    mfaEnabled: false,
    lastActiveHoursAgo: 168,
  },
]

export function createUsers(): User[] {
  return USER_SEEDS.map((seed, index) => ({
    id: paddedId('usr', index + 1, 3),
    name: seed.name,
    email: seed.email,
    role: seed.role,
    organizationId: ORGANIZATIONS[0]?.id ?? 'org-001',
    lastActiveAt: isoAgo(0, seed.lastActiveHoursAgo),
    status: seed.status,
    mfaEnabled: seed.mfaEnabled,
  }))
}

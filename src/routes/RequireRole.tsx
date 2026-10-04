import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/hooks/useAuth'
import type { UserRole } from '@/types'

/**
 * Gate for the `/admin` branch.
 *
 * Signing in is not the same as being allowed to administer, so the admin routes
 * sit behind a second check on top of `ProtectedRoute`. Viewers and analysts are
 * redirected to their workspace root rather than shown an error, because being
 * refused a screen is not a failure worth reporting.
 *
 * This mirrors what a real deployment must enforce server-side. Client-side
 * gating only keeps the UI honest; the services are the actual boundary.
 */
export function RequireRole({ roles }: { roles: readonly UserRole[] }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from: returnTo }} />
  }

  if (!roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useIsAuthenticated } from '@/hooks/useAuth'

/**
 * Gate for authenticated routes. Unauthenticated visitors are redirected to the
 * login screen with the attempted path preserved, so sign-in returns them to
 * where they were headed.
 */
export function ProtectedRoute() {
  const isAuthenticated = useIsAuthenticated()
  const location = useLocation()

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from: returnTo }} />
  }

  return <Outlet />
}

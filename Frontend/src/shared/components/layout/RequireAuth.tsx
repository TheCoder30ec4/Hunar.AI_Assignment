import { Navigate, Outlet, useLocation } from 'react-router'

import { useAuthStore } from '@/features/auth'

/**
 * Wraps the shell layout route. Redirects to /login when no token is
 * present, preserving the attempted path so login can send the user back.
 */
export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}

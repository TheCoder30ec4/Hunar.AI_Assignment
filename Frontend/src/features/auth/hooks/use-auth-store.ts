import { create } from 'zustand'

import { clearAuthTokens, getAuthToken, setAuthTokens } from '@/shared/api/auth-token'

interface AuthUser {
  readonly email: string
  readonly role: 'admin' | 'user'
}

/**
 * Rebuilds the signed-in user from the stored access token.
 *
 * Without this the store only knows who you are until the next reload — the
 * tokens persist but `user` didn't, so the profile menu degraded to a
 * generic "Signed in". The JWT already carries `sub` (email) and `role`, so
 * there is nothing extra to store: decode what we have.
 *
 * The payload is NOT trusted for authorisation — the backend verifies the
 * signature on every request. This is display only.
 */
function userFromToken(): AuthUser | null {
  const token = getAuthToken()
  if (!token) return null
  try {
    const payload: unknown = JSON.parse(
      atob(token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/') ?? ''),
    )
    if (typeof payload !== 'object' || payload === null) return null
    const { sub, role } = payload as { sub?: unknown; role?: unknown }
    if (typeof sub !== 'string') return null
    return { email: sub, role: role === 'admin' ? 'admin' : 'user' }
  } catch {
    // Malformed/undecodable token — treated as "unknown user", not an error.
    // A genuinely invalid token fails at the API boundary, not here.
    return null
  }
}

interface AuthState {
  readonly user: AuthUser | null
  readonly isAuthenticated: boolean
  readonly login: (accessToken: string, refreshToken: string, user: AuthUser) => void
  readonly logout: () => void
}

/**
 * Deliberately not "server state" even though it originates from a login
 * response — this is a client-side session flag the router reads
 * synchronously to decide whether to redirect. The actual account data isn't
 * refetched or cached the way TanStack Query manages it.
 */
export const useAuthStore = create<AuthState>((set) => ({
  // Seeded from the token so a reload keeps showing who is signed in.
  user: userFromToken(),
  // Seeded from localStorage so a page refresh doesn't bounce a logged-in
  // user back to /login before any request has even run.
  isAuthenticated: getAuthToken() !== null,
  login: (accessToken, refreshToken, user) => {
    setAuthTokens(accessToken, refreshToken)
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    clearAuthTokens()
    set({ user: null, isAuthenticated: false })
  },
}))

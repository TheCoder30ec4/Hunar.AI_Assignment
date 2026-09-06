import { create } from 'zustand'

import { clearAuthToken, getAuthToken, setAuthToken } from '@/shared/api/auth-token'

interface AuthUser {
  readonly email: string
  readonly role: 'admin' | 'user'
}

interface AuthState {
  readonly user: AuthUser | null
  readonly isAuthenticated: boolean
  readonly login: (token: string, user: AuthUser) => void
  readonly logout: () => void
}

/**
 * Deliberately not "server state" even though it originates from a login
 * response — this is a client-side session flag the router reads
 * synchronously to decide whether to redirect. The actual account data isn't
 * refetched or cached the way TanStack Query manages it.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // Seeded from localStorage so a page refresh doesn't bounce a logged-in
  // user back to /login before any request has even run.
  isAuthenticated: getAuthToken() !== null,
  login: (token, user) => {
    setAuthToken(token)
    set({ user, isAuthenticated: true })
  },
  logout: () => {
    clearAuthToken()
    set({ user: null, isAuthenticated: false })
  },
}))

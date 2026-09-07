/**
 * The single place that knows the tokens live in localStorage. apiFetch and
 * the auth feature both go through this — never read/write the keys directly
 * elsewhere, or a storage-key rename becomes a grep-and-hope.
 */
const ACCESS_KEY = 'hunar.auth.token'
const REFRESH_KEY = 'hunar.auth.refresh'

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    // Private browsing / storage disabled — treat as logged out rather than throw.
    return null
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  try {
    localStorage.setItem(ACCESS_KEY, accessToken)
    localStorage.setItem(REFRESH_KEY, refreshToken)
  } catch {
    // Storage unavailable: the session simply won't survive a refresh.
  }
}

/** Swaps in a freshly-refreshed access token without touching the refresh token. */
export function setAccessToken(accessToken: string): void {
  try {
    localStorage.setItem(ACCESS_KEY, accessToken)
  } catch {
    // Storage unavailable — nothing to persist.
  }
}

export function clearAuthTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    // Nothing to clean up if storage never worked.
  }
}

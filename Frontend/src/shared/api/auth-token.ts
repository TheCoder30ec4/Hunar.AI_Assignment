/**
 * The single place that knows the token lives in localStorage. apiFetch and
 * the auth feature both go through this — never read/write the key directly
 * elsewhere, or a storage-key rename becomes a grep-and-hope.
 */
const STORAGE_KEY = 'hunar.auth.token'

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private browsing / storage disabled — treat as logged out rather than throw.
    return null
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Storage unavailable: the session simply won't survive a refresh.
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clean up if storage never worked.
  }
}

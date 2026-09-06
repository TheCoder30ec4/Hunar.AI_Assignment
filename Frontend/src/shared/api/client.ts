import type { z } from 'zod'

import { getAuthToken, clearAuthToken } from './auth-token'
import { ApiErrorException, apiErrorFromStatus, apiErrorFromThrown } from './errors'

const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? '/api'
const TIMEOUT_MS = 30_000

export interface ApiFetchOptions<T> {
  /** Every response is parsed through this before a component sees it. */
  readonly schema: z.ZodType<T>
  /** Passed through from TanStack Query's queryFn context so cancels propagate. */
  readonly signal?: AbortSignal | undefined
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined
  readonly body?: unknown
  readonly headers?: Readonly<Record<string, string>> | undefined
}

function authHeaders(): Record<string, string> {
  // The logged-in user's token takes priority; VITE_API_TOKEN remains as a
  // dev-only override for hitting the API without going through /auth/login.
  const token = getAuthToken() ?? import.meta.env['VITE_API_TOKEN']
  return typeof token === 'string' && token.length > 0
    ? { Authorization: `Bearer ${token}` }
    : {}
}

/** Pull a useful message + field errors out of an error response body. */
async function describeFailure(
  response: Response,
): Promise<{ message: string; fieldErrors?: Record<string, readonly string[]> | undefined }> {
  try {
    const payload: unknown = await response.json()
    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>
      const message =
        typeof record['message'] === 'string' ? record['message'] : response.statusText
      const fieldErrors =
        typeof record['fieldErrors'] === 'object' && record['fieldErrors'] !== null
          ? (record['fieldErrors'] as Record<string, readonly string[]>)
          : undefined
      return { message, fieldErrors }
    }
  } catch {
    // Body was not JSON. Fall through to the status text.
  }
  return { message: response.statusText || `Request failed with status ${String(response.status)}` }
}

/**
 * The single network boundary for the whole app.
 *
 * Four third-party people-search providers sit behind this backend, so the data
 * WILL be inconsistent. Every response is Zod-parsed here — parse, don't trust.
 * That is what keeps `any` out of every feature above this line.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions<T>): Promise<T> {
  const { schema, signal, method = 'GET', body, headers } = options

  // AbortSignal.any is native: whichever fires first (caller navigating away,
  // or our 30s ceiling) aborts the request.
  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS)
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      signal: combinedSignal,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...authHeaders(),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (cause) {
    throw apiErrorFromThrown(cause)
  }

  if (!response.ok) {
    const { message, fieldErrors } = await describeFailure(response)
    // A 401 means the stored token is missing/expired/invalid — drop it so the
    // next render's auth check sends the user back to /login instead of
    // silently retrying the same dead token forever.
    if (response.status === 401) clearAuthToken()
    throw apiErrorFromStatus(response.status, message, fieldErrors)
  }

  let payload: unknown
  try {
    payload = response.status === 204 ? null : await response.json()
  } catch (cause) {
    throw apiErrorFromThrown(cause)
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    // Log the payload — a schema mismatch means a provider changed shape on us,
    // and the raw body is the only way to work out which one.
    console.error('[api] response failed schema validation', {
      path,
      issues: parsed.error.issues,
      payload,
    })
    throw new ApiErrorException({
      status: response.status,
      code: 'SCHEMA_MISMATCH',
      message: `The server returned unexpected data for ${path}.`,
      retryable: false, // Retrying returns the same bad shape.
    })
  }

  return parsed.data
}

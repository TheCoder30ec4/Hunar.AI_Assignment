/**
 * Every failure in the app — network, HTTP, schema — normalises to this shape
 * at the client boundary. Components never see a raw fetch rejection.
 */
export interface ApiError {
  readonly status: number
  readonly code: ApiErrorCode
  readonly message: string
  readonly retryable: boolean
  /** Explicit `| undefined` because exactOptionalPropertyTypes is on. */
  readonly fieldErrors?: Record<string, readonly string[]> | undefined
}

export type ApiErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'SCHEMA_MISMATCH'
  | 'UNKNOWN'

/**
 * Carrier so an ApiError survives `throw` and TanStack Query's error channel
 * while staying structurally checkable via isApiError().
 */
export class ApiErrorException extends Error implements ApiError {
  readonly status: number
  readonly code: ApiErrorCode
  readonly retryable: boolean
  readonly fieldErrors?: Record<string, readonly string[]> | undefined

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ApiErrorException'
    this.status = error.status
    this.code = error.code
    this.retryable = error.retryable
    this.fieldErrors = error.fieldErrors
  }
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ApiError>
  return (
    typeof candidate.status === 'number' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.retryable === 'boolean'
  )
}

/**
 * Retry network blips, timeouts, 5xx and 429 — never any other 4xx.
 * A 400/401/403/404 will fail identically on retry and just burns time.
 * An aborted request is never retried: the caller navigated away.
 */
export function isRetryable(error: unknown): boolean {
  if (!isApiError(error)) return false
  return error.retryable
}

function retryableForStatus(status: number): boolean {
  if (status === 429) return true
  return status >= 500
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 422:
      return 'VALIDATION'
    case 429:
      return 'RATE_LIMITED'
    default:
      return status >= 500 ? 'SERVER' : 'UNKNOWN'
  }
}

export function apiErrorFromStatus(
  status: number,
  message: string,
  fieldErrors?: Record<string, readonly string[]> | undefined,
): ApiErrorException {
  return new ApiErrorException({
    status,
    code: codeForStatus(status),
    message,
    retryable: retryableForStatus(status),
    fieldErrors,
  })
}

export function apiErrorFromThrown(cause: unknown): ApiErrorException {
  if (cause instanceof ApiErrorException) return cause

  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return new ApiErrorException({
      status: 0,
      code: 'ABORTED',
      message: 'Request was cancelled.',
      retryable: false,
    })
  }

  if (cause instanceof DOMException && cause.name === 'TimeoutError') {
    return new ApiErrorException({
      status: 0,
      code: 'TIMEOUT',
      message: 'The request took longer than 30 seconds. Provider searches can be slow — try again.',
      retryable: true,
    })
  }

  return new ApiErrorException({
    status: 0,
    code: 'NETWORK',
    message: cause instanceof Error ? cause.message : 'Could not reach the server.',
    retryable: true,
  })
}

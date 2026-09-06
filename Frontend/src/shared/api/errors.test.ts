import { describe, expect, it } from 'vitest'

import {
  ApiErrorException,
  apiErrorFromStatus,
  apiErrorFromThrown,
  isApiError,
  isRetryable,
} from './errors'

describe('isRetryable', () => {
  it('retries 5xx — the server may recover', () => {
    expect(isRetryable(apiErrorFromStatus(500, 'boom'))).toBe(true)
    expect(isRetryable(apiErrorFromStatus(503, 'unavailable'))).toBe(true)
  })

  it('retries 429 after backoff', () => {
    expect(isRetryable(apiErrorFromStatus(429, 'slow down'))).toBe(true)
  })

  it('never retries other 4xx — the same request fails identically', () => {
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isRetryable(apiErrorFromStatus(status, 'nope'))).toBe(false)
    }
  })

  it('retries a network failure', () => {
    expect(isRetryable(apiErrorFromThrown(new TypeError('Failed to fetch')))).toBe(true)
  })

  it('never retries an abort — the caller navigated away', () => {
    const aborted = new DOMException('The user aborted a request.', 'AbortError')
    expect(isRetryable(apiErrorFromThrown(aborted))).toBe(false)
  })

  it('retries a timeout — provider searches are genuinely slow', () => {
    const timedOut = new DOMException('The operation timed out.', 'TimeoutError')
    expect(isRetryable(apiErrorFromThrown(timedOut))).toBe(true)
  })

  it('is false for anything that is not an ApiError', () => {
    expect(isRetryable(new Error('plain'))).toBe(false)
    expect(isRetryable(null)).toBe(false)
    expect(isRetryable('a string')).toBe(false)
  })
})

describe('apiErrorFromStatus', () => {
  it('maps statuses to codes', () => {
    expect(apiErrorFromStatus(401, 'x').code).toBe('UNAUTHORIZED')
    expect(apiErrorFromStatus(403, 'x').code).toBe('FORBIDDEN')
    expect(apiErrorFromStatus(404, 'x').code).toBe('NOT_FOUND')
    expect(apiErrorFromStatus(422, 'x').code).toBe('VALIDATION')
    expect(apiErrorFromStatus(429, 'x').code).toBe('RATE_LIMITED')
    expect(apiErrorFromStatus(500, 'x').code).toBe('SERVER')
  })

  it('carries field errors through for form display', () => {
    const error = apiErrorFromStatus(422, 'Validation failed', {
      mobile_number: ['Must be E.164 format'],
    })
    expect(error.fieldErrors?.['mobile_number']).toEqual(['Must be E.164 format'])
  })
})

describe('ApiErrorException', () => {
  it('survives a throw and stays structurally checkable', () => {
    const thrown = apiErrorFromStatus(500, 'server exploded')
    expect(() => {
      throw thrown
    }).toThrow(ApiErrorException)
    expect(isApiError(thrown)).toBe(true)
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.message).toBe('server exploded')
  })

  it('passes an existing ApiErrorException through unchanged', () => {
    const original = apiErrorFromStatus(404, 'gone')
    expect(apiErrorFromThrown(original)).toBe(original)
  })
})

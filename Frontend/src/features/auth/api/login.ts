import { apiFetch } from '@/shared/api/client'

import { loginResponseSchema, type LoginFormValues, type LoginResponse } from '../schemas/login'

export function login(
  credentials: LoginFormValues,
  signal?: AbortSignal,
): Promise<LoginResponse> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: credentials,
    schema: loginResponseSchema,
    signal,
  })
}

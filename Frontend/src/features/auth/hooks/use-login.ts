import { useMutation } from '@tanstack/react-query'

import { login } from '../api/login'
import type { LoginFormValues } from '../schemas/login'
import { useAuthStore } from './use-auth-store'

/**
 * Never optimistic: this is the request that proves who you are. Waits for
 * the server's 200 before writing anything to storage or state.
 */
export function useLogin() {
  const storeLogin = useAuthStore((state) => state.login)

  return useMutation({
    mutationFn: (credentials: LoginFormValues) => login(credentials),
    onSuccess: (response) => {
      storeLogin(response.access_token, { email: response.email, role: response.role })
    },
  })
}

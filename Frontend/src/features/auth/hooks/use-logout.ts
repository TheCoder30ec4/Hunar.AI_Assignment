import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router'

import { logout as logoutRequest } from '../api/login'
import { useAuthStore } from './use-auth-store'

/**
 * Clears local state immediately rather than waiting on the network — the
 * backend call is best-effort housekeeping (there's no server-side session
 * to actually invalidate, see Backend/controllers/auth_controller.py), not
 * something the user should be blocked on to leave their own account.
 */
export function useLogout() {
  const storeLogout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: () => logoutRequest(),
    onSettled: () => {
      storeLogout()
      navigate('/login', { replace: true })
    },
  })
}

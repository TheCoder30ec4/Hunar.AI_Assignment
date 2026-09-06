import { z } from 'zod'

/** What the login form collects — validated client-side before the request fires. */
export const loginFormSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
})
export type LoginFormValues = z.infer<typeof loginFormSchema>

/** What POST /auth/login actually returns. Matches Backend's LoginResponseDTO. */
export const loginResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  email: z.string(),
  role: z.enum(['admin', 'user']),
})
export type LoginResponse = z.infer<typeof loginResponseSchema>

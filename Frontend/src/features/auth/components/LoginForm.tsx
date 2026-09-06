import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'

import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { isApiError } from '@/shared/api/errors'
import { cn } from '@/shared/lib/cn'

import { useLogin } from '../hooks/use-login'
import { loginFormSchema, type LoginFormValues } from '../schemas/login'

export function LoginForm() {
  const navigate = useNavigate()
  const loginMutation = useLogin()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = (values: LoginFormValues): void => {
    loginMutation.mutate(values, {
      onSuccess: () => navigate('/campaigns', { replace: true }),
    })
  }

  const serverError = loginMutation.isError
    ? isApiError(loginMutation.error) && loginMutation.error.status === 401
      ? 'Incorrect email or password.'
      : 'Could not reach the server. Try again.'
    : null

  return (
    <form onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-medium text-[var(--color-ink)]">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p id="email-error" className="text-[12px] text-[var(--color-sig-bad)]">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[13px] font-medium text-[var(--color-ink)]">
          Password
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={errors.password ? 'password-error' : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p id="password-error" className="text-[12px] text-[var(--color-sig-bad)]">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      {serverError ? (
        <p role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
          {serverError}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={loginMutation.isPending}
        className={cn('mt-1 w-full')}
      >
        {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

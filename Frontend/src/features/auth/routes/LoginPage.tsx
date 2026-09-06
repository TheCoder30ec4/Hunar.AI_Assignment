import { LoginForm } from '../components/LoginForm'

export function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--color-bg)] p-6">
      <div
        className={[
          'w-full max-w-sm rounded-[var(--radius-control)] border border-[var(--color-line)]',
          'bg-[var(--color-surface)] p-6 shadow-[var(--shadow-float)]',
        ].join(' ')}
      >
        <h1 className="text-[15px] font-semibold text-[var(--color-ink)]">Sign in</h1>
        <p className="mt-1 text-[13px] text-[var(--color-ink-muted)]">
          People search &amp; reachout console
        </p>
        <div className="mt-5">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}

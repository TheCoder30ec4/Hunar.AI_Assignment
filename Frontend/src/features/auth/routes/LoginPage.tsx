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
        <h1 className="text-[17px] font-semibold text-[var(--color-ink)]">
          Hunar.AI-FDE Assignment
        </h1>
        <p className="machine mt-1 text-[12px] text-[var(--color-ink-muted)]">
          varun30ec4@gmail.com
        </p>

        <div className="mt-5 border-t border-[var(--color-line)] pt-5">
          <h2 className="text-[13px] font-medium text-[var(--color-ink)]">Sign in</h2>
          <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
            People search &amp; reachout console
          </p>
          <div className="mt-4">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  )
}

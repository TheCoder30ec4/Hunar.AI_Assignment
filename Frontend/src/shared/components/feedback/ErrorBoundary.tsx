import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'

import { Button } from '@/shared/components/ui/button'

interface Props {
  readonly children: ReactNode
  /** Names the region that failed, so the message says what broke. */
  readonly label?: string | undefined
  readonly onReset?: (() => void) | undefined
}

interface State {
  readonly error: Error | null
}

/**
 * Used at all three levels: app root, route (via errorElement) and pane.
 * A detail pane throwing must never take down the results table beside it.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[error-boundary]', this.props.label ?? 'app', error, info.componentStack)
  }

  private readonly handleReset = (): void => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  override render(): ReactNode {
    const { error } = this.state
    if (error === null) return this.props.children

    return (
      <ErrorPanel
        title={`${this.props.label ?? 'This view'} could not be displayed`}
        detail={error.message}
        onRetry={this.handleReset}
      />
    )
  }
}

export function ErrorPanel({
  title,
  detail,
  onRetry,
}: {
  readonly title: string
  readonly detail?: string | undefined
  readonly onRetry?: (() => void) | undefined
}) {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-start justify-center gap-2 p-6 text-[13px]"
    >
      <p className="font-medium text-[var(--color-sig-bad)]">{title}</p>
      {detail === undefined ? null : (
        <p className="max-w-prose text-[var(--color-ink-muted)]">{detail}</p>
      )}
      {onRetry === undefined ? null : (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          Try again
        </Button>
      )}
    </div>
  )
}

/** Route-level errorElement. Reads the error out of the router, not a throw. */
export function RouteErrorBoundary() {
  const error = useRouteError()

  if (isRouteErrorResponse(error)) {
    return (
      <ErrorPanel
        title={`${String(error.status)} — ${error.statusText}`}
        detail={typeof error.data === 'string' ? error.data : undefined}
      />
    )
  }

  return (
    <ErrorPanel
      title="This page could not be displayed"
      detail={error instanceof Error ? error.message : 'An unexpected error occurred.'}
    />
  )
}

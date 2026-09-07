import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { Providers } from '@/app/providers'
import '@/styles/globals.css'

/**
 * The MSW worker is AWAITED before the first render. Starting it alongside
 * createRoot lets the first queries race the worker, which shows up as an
 * intermittent "sometimes the first load has no data" flake.
 */
async function enableMocking(): Promise<void> {
  if (!import.meta.env.DEV) return

  const { worker } = await import('@/mocks/browser')
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: {
      // Scope the worker to the app itself. Without this it also intercepts
      // top-level navigation requests and tries to pass them through, which
      // surfaces as an "Uncaught (in promise) TypeError: Failed to fetch"
      // from mockServiceWorker.js on every page load — noise, not a fault,
      // but it buries real errors in the console.
      options: { scope: '/' },
    },
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('Root container #root is missing from index.html')

void enableMocking().then(() => {
  createRoot(container).render(
    <StrictMode>
      <Providers />
    </StrictMode>,
  )
})

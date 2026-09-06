import { Outlet, useParams } from 'react-router'

import { RouteStub } from '@/shared/components/feedback/RouteStub'

export function SearchResultsPage() {
  const { searchId } = useParams()

  return (
    <RouteStub title={`Search results — ${searchId ?? 'unknown'}`} phase="phase 5 — results">
      {/* The nested candidate route renders here (pane 3), not in local state. */}
      <Outlet />
    </RouteStub>
  )
}

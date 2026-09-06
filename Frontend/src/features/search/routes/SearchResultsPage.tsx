import { Outlet, useParams } from 'react-router'

import { RouteStub } from '@/shared/components/feedback/RouteStub'
import { TopBar } from '@/shared/components/layout/TopBar'

export function SearchResultsPage() {
  const { searchId } = useParams()

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="Search results" breadcrumb={searchId ?? 'unknown'} creditsBalance={8420} />
      <div className="overflow-auto">
        <RouteStub title={`Search results — ${searchId ?? 'unknown'}`} phase="phase 5 — results">
          {/* The nested candidate route renders here (pane 3), not in local state. */}
          <Outlet />
        </RouteStub>
      </div>
    </div>
  )
}

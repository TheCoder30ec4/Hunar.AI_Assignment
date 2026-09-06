import { Link, Outlet, useParams } from 'react-router'

import { RouteStub } from '@/shared/components/feedback/RouteStub'

export function CampaignDashboardPage() {
  const { campaignId } = useParams()

  return (
    <RouteStub
      title={`Campaign — ${campaignId ?? 'unknown'}`}
      phase="phase 6 — campaign dashboard"
    >
      <Link
        to={`/campaigns/${campaignId ?? ''}/review`}
        className="mt-2 inline-block text-[13px] text-[var(--color-accent)] underline-offset-4 hover:underline"
      >
        Open compliance review
      </Link>
      {/* Call detail drawer renders here as a nested route. */}
      <Outlet />
    </RouteStub>
  )
}

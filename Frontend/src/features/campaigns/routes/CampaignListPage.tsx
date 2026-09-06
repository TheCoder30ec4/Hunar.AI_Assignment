import { RouteStub } from '@/shared/components/feedback/RouteStub'
import { TopBar } from '@/shared/components/layout/TopBar'

export function CampaignListPage() {
  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="Campaigns" creditsBalance={8420} />
      <div className="overflow-auto">
        <RouteStub title="Campaigns" phase="phase 6 — campaign dashboard" />
      </div>
    </div>
  )
}

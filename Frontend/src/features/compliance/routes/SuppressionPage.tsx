import { RouteStub } from '@/shared/components/feedback/RouteStub'
import { TopBar } from '@/shared/components/layout/TopBar'

export function SuppressionPage() {
  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="Suppression list" creditsBalance={8420} />
      <div className="overflow-auto">
        <RouteStub title="Suppression list" phase="phase 9 — compliance and settings" />
      </div>
    </div>
  )
}

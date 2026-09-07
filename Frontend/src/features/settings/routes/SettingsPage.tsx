import { useParams } from 'react-router'

import { RouteStub } from '@/shared/components/feedback/RouteStub'
import { TopBar } from '@/shared/components/layout/TopBar'

export function SettingsPage() {
  const { tab } = useParams()

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="Settings" breadcrumb={tab ?? 'providers'} creditsBalance={8420} />
      <div className="overflow-auto">
        <RouteStub
          title={`Settings — ${tab ?? 'providers'}`}
          phase="phase 9 — compliance and settings"
        />
      </div>
    </div>
  )
}

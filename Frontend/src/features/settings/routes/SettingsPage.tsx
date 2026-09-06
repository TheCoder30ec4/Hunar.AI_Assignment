import { useParams } from 'react-router'

import { RouteStub } from '@/shared/components/feedback/RouteStub'

export function SettingsPage() {
  const { tab } = useParams()

  return (
    <RouteStub
      title={`Settings — ${tab ?? 'providers'}`}
      phase="phase 9 — compliance and settings"
    />
  )
}

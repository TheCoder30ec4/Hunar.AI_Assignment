import { useNavigate } from 'react-router'

import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { TopBar } from '@/shared/components/layout/TopBar'
import { formatRelative } from '@/shared/lib/format'
import { CAMPAIGN_STATUS_TONE, type Campaign } from '@/shared/types/domain'
import { asCampaignId } from '@/shared/types/ids'

import { useCampaigns } from '../hooks/use-campaigns'

export function CampaignListPage() {
  const campaigns = useCampaigns()

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="Campaigns" creditsBalance={8420} />
      <div className="overflow-auto p-6">
        {campaigns.isPending ? <ListSkeleton /> : null}

        {campaigns.isError ? (
          <div role="alert" className="text-[13px]">
            <p className="text-[var(--color-sig-bad)]">Could not load campaigns.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void campaigns.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {campaigns.data && campaigns.data.length === 0 ? (
          <div className="flex flex-col items-start gap-2 text-[13px]">
            <p className="text-[var(--color-ink-muted)]">No campaigns yet.</p>
            <Button variant="primary" size="sm" onClick={() => window.location.assign('/searches/new')}>
              Start a new search
            </Button>
          </div>
        ) : null}

        {campaigns.data && campaigns.data.length > 0 ? (
          <div className="flex flex-col divide-y divide-[var(--color-line)] rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            {campaigns.data.map((campaign) => (
              <CampaignRow key={campaign.id} campaign={campaign} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CampaignRow({ campaign }: { readonly campaign: Campaign }) {
  const navigate = useNavigate()
  const tone = CAMPAIGN_STATUS_TONE[campaign.status]
  const connectRate =
    campaign.calledCount > 0 ? Math.round((campaign.connectedCount / campaign.calledCount) * 100) : null

  return (
    <button
      type="button"
      onClick={() => navigate(`/campaigns/${asCampaignId(campaign.id)}`)}
      className="flex items-center gap-4 px-4 py-3 text-left hover:bg-[var(--color-surface-sunk)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
            {campaign.name}
          </span>
          <Badge variant={tone.tone}>{tone.label}</Badge>
        </div>
        <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
          Started {formatRelative(campaign.createdAt)}
        </p>
      </div>

      <div className="machine flex shrink-0 items-center gap-6 text-[13px] text-[var(--color-ink)]">
        <Stat label="Callable" value={campaign.candidateCount} />
        <Stat label="Excluded" value={campaign.excludedCount} />
        <Stat label="Called" value={campaign.calledCount} />
        <Stat label="Connected" value={campaign.connectedCount} />
        <Stat label="Qualified" value={campaign.qualifiedCount} />
        <Stat label="Connect rate" value={connectRate !== null ? `${String(connectRate)}%` : '—'} />
      </div>
    </button>
  )
}

function Stat({ label, value }: { readonly label: string; readonly value: number | string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="tabular font-medium">{value}</span>
      <span className="text-[10px] font-sans text-[var(--color-ink-muted)]">{label}</span>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div
      className="flex flex-col divide-y divide-[var(--color-line)] rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)]"
      aria-busy="true"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <div className="flex-1">
            <Skeleton className="h-4 w-64" />
            <Skeleton className="mt-1.5 h-3 w-32" />
          </div>
          <Skeleton className="h-9 w-80" />
        </div>
      ))}
    </div>
  )
}

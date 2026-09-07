import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useCampaigns } from '@/features/campaigns/hooks/use-campaigns'
import { Skeleton } from '@/shared/components/feedback/Skeleton'
import { TopBar } from '@/shared/components/layout/TopBar'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/cn'
import { asCampaignId } from '@/shared/types/ids'

import { useCampaignSettings, useUpdateCampaignSettings } from '../hooks/use-campaign-settings'
import { DAYS, TIMEZONES, type CampaignSettings } from '../schemas/campaign-settings'

/**
 * Calling configuration, scoped per campaign — each campaign stores its own
 * script additions, calling window, timezone and retry policy on its own
 * `campaigns` row, and the calling pipeline reads them at dial time.
 *
 * The selected campaign lives in the URL (?campaign=…) so a configured
 * campaign is a shareable link and survives a refresh.
 */
export function SettingsPage() {
  const campaigns = useCampaigns()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('campaign') ?? ''

  // Default to the newest campaign once the list arrives.
  useEffect(() => {
    if (!selectedId && campaigns.data && campaigns.data.length > 0) {
      const first = campaigns.data[0]
      if (first) setSearchParams({ campaign: first.id }, { replace: true })
    }
  }, [selectedId, campaigns.data, setSearchParams])

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="Settings" breadcrumb="calling configuration" />
      <div className="overflow-auto p-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-5">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--color-ink)]">
              Campaign
            </label>
            <p className="mb-2 text-[12px] text-[var(--color-ink-muted)]">
              Each campaign keeps its own calling configuration. Changes here affect only the
              campaign selected.
            </p>
            {campaigns.isPending ? (
              <Skeleton className="h-9 w-full" />
            ) : campaigns.data && campaigns.data.length > 0 ? (
              <Select
                value={selectedId}
                onValueChange={(value) => setSearchParams({ campaign: value })}
              >
                <SelectTrigger className="w-full" aria-label="Campaign">
                  <SelectValue placeholder="Choose a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.data.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-[13px] text-[var(--color-ink-muted)]">
                No campaigns yet — create one from a search first.
              </p>
            )}
          </div>

          {selectedId ? <SettingsForm key={selectedId} campaignId={selectedId} /> : null}
        </div>
      </div>
    </div>
  )
}

function SettingsForm({ campaignId }: { readonly campaignId: string }) {
  const id = asCampaignId(campaignId)
  const settings = useCampaignSettings(id)
  const update = useUpdateCampaignSettings(id)
  const [draft, setDraft] = useState<CampaignSettings | null>(null)

  // Reset the draft whenever the server's copy changes (campaign switch or
  // a successful save) so the form never shows stale edits.
  useEffect(() => {
    if (settings.data) setDraft(settings.data)
  }, [settings.data])

  if (settings.isPending || !draft) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    )
  }

  if (settings.isError) {
    return (
      <div role="alert" className="text-[13px]">
        <p className="text-[var(--color-sig-bad)]">Could not load these settings.</p>
        <Button variant="secondary" size="sm" className="mt-2" onClick={() => void settings.refetch()}>
          Retry
        </Button>
      </div>
    )
  }

  const set = <K extends keyof CampaignSettings>(key: K, value: CampaignSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))

  const toggleDay = (day: string) =>
    set(
      'allowedDays',
      draft.allowedDays.includes(day)
        ? draft.allowedDays.filter((d) => d !== day)
        : [...DAYS].filter((d) => d === day || draft.allowedDays.includes(d)),
    )

  const windowInvalid = draft.callingWindowStart >= draft.callingWindowEnd
  const noDays = draft.allowedDays.length === 0

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        update.mutate(draft)
      }}
    >
      <Section
        title="What the agent says"
        description="Added to the shared screening script for this campaign only. The agent already introduces itself, confirms interest and asks about experience, notice period, compensation and availability — use this for anything specific to this role."
      >
        <textarea
          value={draft.scriptTemplate ?? ''}
          onChange={(event) => set('scriptTemplate', event.target.value)}
          rows={4}
          placeholder="e.g. Mention this is a 6-month apprenticeship that converts to a permanent role."
          className="w-full resize-y rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5 text-[13px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
        />
      </Section>

      <Section
        title="When calls may be placed"
        description="Enforced by the calling provider — a call is never dialled outside this window."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-ink-muted)]">From</span>
            <Input
              type="time"
              value={draft.callingWindowStart}
              onChange={(event) => set('callingWindowStart', event.target.value)}
              className="w-32"
              aria-label="Calling window start"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-ink-muted)]">To</span>
            <Input
              type="time"
              value={draft.callingWindowEnd}
              onChange={(event) => set('callingWindowEnd', event.target.value)}
              className="w-32"
              aria-label="Calling window end"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-ink-muted)]">Timezone</span>
            <Select value={draft.timezone} onValueChange={(value) => set('timezone', value)}>
              <SelectTrigger className="w-48" aria-label="Timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        {windowInvalid ? (
          <p role="alert" className="mt-2 text-[12px] text-[var(--color-sig-bad)]">
            The end of the window must be later than the start.
          </p>
        ) : null}

        <div className="mt-3">
          <span className="mb-1.5 block text-[12px] text-[var(--color-ink-muted)]">Days</span>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((day) => {
              const active = draft.allowedDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'rounded-[var(--radius-control)] border px-2.5 py-1 text-[12px] font-medium',
                    'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
                    active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-surface)]'
                      : 'border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunk)]',
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
          {noDays ? (
            <p role="alert" className="mt-2 text-[12px] text-[var(--color-sig-bad)]">
              Pick at least one day, or no call can ever be placed.
            </p>
          ) : null}
        </div>
      </Section>

      <Section
        title="Retries"
        description="How persistently to chase someone who doesn't pick up."
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-ink-muted)]">Attempts per candidate</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={draft.maxAttempts}
              onChange={(event) =>
                set('maxAttempts', Math.min(10, Math.max(1, Number(event.target.value) || 1)))
              }
              className="w-28"
              aria-label="Attempts per candidate"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] text-[var(--color-ink-muted)]">Hours between retries</span>
            <Input
              type="number"
              min={0}
              max={168}
              value={draft.retryIntervalHours}
              onChange={(event) =>
                set('retryIntervalHours', Math.min(168, Math.max(0, Number(event.target.value) || 0)))
              }
              className="w-28"
              aria-label="Hours between retries"
            />
          </label>
        </div>
      </Section>

      <div className="flex items-center gap-3 border-t border-[var(--color-line)] pt-4">
        <Button type="submit" variant="primary" disabled={update.isPending || windowInvalid || noDays}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {update.isSuccess ? <Badge variant="good">Saved</Badge> : null}
        {update.isError ? (
          <span role="alert" className="text-[13px] text-[var(--color-sig-bad)]">
            Could not save. Try again.
          </span>
        ) : null}
      </div>
    </form>
  )
}

function Section({
  title,
  description,
  children,
}: {
  readonly title: string
  readonly description: string
  readonly children: React.ReactNode
}) {
  return (
    <section className="rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <h2 className="text-[13px] font-semibold text-[var(--color-ink)]">{title}</h2>
      <p className="mb-3 mt-0.5 text-[12px] text-[var(--color-ink-muted)]">{description}</p>
      {children}
    </section>
  )
}

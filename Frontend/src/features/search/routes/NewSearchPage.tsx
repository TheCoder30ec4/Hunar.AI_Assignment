import { useState } from 'react'
import { useNavigate } from 'react-router'

import { TopBar } from '@/shared/components/layout/TopBar'
import { cn } from '@/shared/lib/cn'
import type { SearchId } from '@/shared/types/ids'

import { FilterChips } from '../components/FilterChips'
import { JdInput } from '../components/JdInput'
import { ProviderPlanTable } from '../components/ProviderPlanTable'
import { RunProgress } from '../components/RunProgress'
import { useCreateSearch, useRunSearchStream } from '../hooks/use-new-search'
import type { SearchSpec } from '../schemas/search-spec'

type PlanStage = { readonly searchId: SearchId } | null

/**
 * JD input and the parsed filter chips stay on screen together once parsed —
 * a recruiter corrects a chip while the original text is still visible,
 * rather than losing the JD the moment it's read. The provider plan (which
 * spends real credits) only appears once the recruiter has confirmed the
 * filters below it, never before.
 *
 * Confirming filters splits the screen rather than replacing it: the JD/
 * filters panel narrows from full-width to the left half, and the provider
 * plan slides in from the right to fill the other half — both stay visible
 * together, nothing goes off-screen. prefers-reduced-motion collapses the
 * transition duration globally (styles/globals.css), so this needs no
 * separate reduced-motion branch.
 */
export function NewSearchPage() {
  const navigate = useNavigate()
  const [spec, setSpec] = useState<SearchSpec | null>(null)
  const [jdText, setJdText] = useState('')
  const [plan, setPlan] = useState<PlanStage>(null)
  const createSearch = useCreateSearch()
  const run = useRunSearchStream()

  const handleSpecSubmit = (submitted: SearchSpec): void => {
    createSearch.mutate(
      { spec: submitted, jdText },
      { onSuccess: (searchId) => setPlan({ searchId }) },
    )
  }

  const showingPlan = plan !== null

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="New search" breadcrumb="searches" />

      <div className="flex h-full min-h-0 overflow-hidden">
        <div
          className={cn(
            'h-full overflow-auto border-r border-[var(--color-line)] transition-[width] duration-500 ease-in-out',
            showingPlan ? 'w-1/2' : 'w-full',
          )}
        >
          <div
            data-tour="jd-panel"
            className={cn('mx-auto flex flex-col gap-4 p-6', showingPlan ? 'max-w-none' : 'max-w-3xl')}
          >
            <JdInput
              onParsed={(parsedSpec, parsedJdText) => {
                setSpec(parsedSpec)
                setJdText(parsedJdText)
              }}
            />

            {spec ? (
              <FilterChips
                initialSpec={spec}
                onSubmit={handleSpecSubmit}
                isSubmitting={createSearch.isPending}
              />
            ) : null}
          </div>
        </div>

        <div
          className={cn(
            'h-full overflow-auto transition-[width,opacity] duration-500 ease-in-out',
            showingPlan ? 'w-1/2 opacity-100' : 'w-0 opacity-0',
          )}
          aria-hidden={!showingPlan}
          inert={!showingPlan ? true : undefined}
        >
          <div data-tour="provider-plan" className="max-w-none p-6">
            {plan && run.status === 'idle' ? (
              <ProviderPlanTable
                onRun={(resultsNeeded) =>
                  run.start(plan.searchId, resultsNeeded, (outcome) =>
                    navigate(`/searches/${outcome.searchId}`),
                  )
                }
              />
            ) : null}
            {plan && run.status !== 'idle' ? <RunProgress state={run} onRetry={run.reset} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

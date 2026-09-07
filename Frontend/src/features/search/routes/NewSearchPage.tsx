import { useState } from 'react'
import { useNavigate } from 'react-router'

import { TopBar } from '@/shared/components/layout/TopBar'
import { cn } from '@/shared/lib/cn'
import type { SearchId } from '@/shared/types/ids'

import { FilterChips } from '../components/FilterChips'
import { JdInput } from '../components/JdInput'
import { ProviderPlanTable } from '../components/ProviderPlanTable'
import { useCreateSearch } from '../hooks/use-new-search'
import type { SearchSpec } from '../schemas/search-spec'

type PlanStage = { readonly searchId: SearchId } | null

/**
 * JD input and the parsed filter chips stay on screen together once parsed —
 * a recruiter corrects a chip while the original text is still visible,
 * rather than losing the JD the moment it's read. The provider plan (which
 * spends real credits) only appears once the recruiter has confirmed the
 * filters below it, never before.
 *
 * The two stages sit side by side in a horizontal track; confirming filters
 * slides the track left instead of swapping content in place, so the
 * transition reads as "moving forward a step" rather than a content flash.
 * prefers-reduced-motion collapses the transition duration globally
 * (styles/globals.css), so this needs no separate reduced-motion branch.
 */
export function NewSearchPage() {
  const navigate = useNavigate()
  const [spec, setSpec] = useState<SearchSpec | null>(null)
  const [plan, setPlan] = useState<PlanStage>(null)
  const createSearch = useCreateSearch()

  const handleSpecSubmit = (submitted: SearchSpec): void => {
    createSearch.mutate(submitted, {
      onSuccess: (searchId) => setPlan({ searchId }),
    })
  }

  const showingPlan = plan !== null

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="New search" breadcrumb="searches" creditsBalance={8420} />

      <div className="overflow-hidden">
        <div
          className={cn(
            'flex h-full w-[200%] transition-transform duration-500 ease-in-out',
            showingPlan && '-translate-x-1/2',
          )}
        >
          <div
            className="w-1/2 overflow-auto"
            // Off-screen once the plan is showing — keeps it out of the tab
            // order and off-screen-reader radar rather than just visually gone.
            aria-hidden={showingPlan}
            inert={showingPlan ? true : undefined}
          >
            <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
              <JdInput onParsed={setSpec} />

              {spec ? (
                <FilterChips
                  initialSpec={spec}
                  onSubmit={handleSpecSubmit}
                  isSubmitting={createSearch.isPending}
                />
              ) : null}
            </div>
          </div>

          <div className="w-1/2 overflow-auto" aria-hidden={!showingPlan} inert={!showingPlan ? true : undefined}>
            <div className="mx-auto max-w-3xl p-6">
              {plan ? (
                <ProviderPlanTable
                  searchId={plan.searchId}
                  onStarted={() => navigate(`/searches/${plan.searchId}`)}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router'

import { TopBar } from '@/shared/components/layout/TopBar'
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

  return (
    <div className="grid min-h-0 grid-rows-[auto_1fr]">
      <TopBar title="New search" breadcrumb="searches" creditsBalance={8420} />

      <div className="overflow-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
          <JdInput onParsed={setSpec} />

          {spec && !plan ? (
            <FilterChips
              initialSpec={spec}
              onSubmit={handleSpecSubmit}
              isSubmitting={createSearch.isPending}
            />
          ) : null}

          {plan ? (
            <ProviderPlanTable
              searchId={plan.searchId}
              onStarted={() => navigate(`/searches/${plan.searchId}`)}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

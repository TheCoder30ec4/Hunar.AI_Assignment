import { useState } from 'react'
import { useNavigate } from 'react-router'

import type { SearchId } from '@/shared/types/ids'

import { FilterChips } from '../components/FilterChips'
import { JdInput } from '../components/JdInput'
import { ProviderPlanTable } from '../components/ProviderPlanTable'
import { useCreateSearch } from '../hooks/use-new-search'
import type { SearchSpec } from '../schemas/search-spec'

type Stage =
  | { readonly step: 'jd' }
  | { readonly step: 'chips'; readonly spec: SearchSpec }
  | { readonly step: 'plan'; readonly searchId: SearchId }

/**
 * Three stages in one route, per the plan: JD text -> editable filter chips
 * -> provider plan with a budget guard. Nothing here updates optimistically —
 * every stage past the first one spends or is about to spend real credits.
 */
export function NewSearchPage() {
  const navigate = useNavigate()
  const [stage, setStage] = useState<Stage>({ step: 'jd' })
  const createSearch = useCreateSearch()

  const handleSpecSubmit = (spec: SearchSpec): void => {
    createSearch.mutate(spec, {
      onSuccess: (searchId) => setStage({ step: 'plan', searchId }),
    })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-1 p-6">
      <h1 className="text-[15px] font-semibold text-[var(--color-ink)]">New search</h1>
      <p className="text-[13px] text-[var(--color-ink-muted)]">
        Paste a job description, review the parsed filters, then confirm the provider spend.
      </p>

      <div className="mt-4">
        {stage.step === 'jd' ? (
          <JdInput onParsed={(spec) => setStage({ step: 'chips', spec })} />
        ) : null}

        {stage.step === 'chips' ? (
          <FilterChips
            initialSpec={stage.spec}
            onSubmit={handleSpecSubmit}
            isSubmitting={createSearch.isPending}
          />
        ) : null}

        {stage.step === 'plan' ? (
          <ProviderPlanTable
            searchId={stage.searchId}
            onStarted={() => navigate(`/searches/${stage.searchId}`)}
          />
        ) : null}
      </div>
    </div>
  )
}

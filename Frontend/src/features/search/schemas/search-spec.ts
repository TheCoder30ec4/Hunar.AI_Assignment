import { z } from 'zod'

import { providerSchema } from '@/shared/types/domain'

/**
 * What POST /searches/parse-jd returns and what the filter-chip form edits.
 * Every field is independently editable — a bad parse on one field (e.g. a
 * garbled seniority guess) must never block editing the others.
 */
export const searchSpecSchema = z.object({
  title: z.string().min(1, 'Title is required.'),
  skills: z.array(z.string().min(1)).min(1, 'Add at least one skill.'),
  seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead']),
  location: z.string().min(1, 'Location is required.'),
  minYearsExperience: z.number().int().min(0).max(40),
  maxYearsExperience: z.number().int().min(0).max(40),
})
export type SearchSpec = z.infer<typeof searchSpecSchema>

/** Cross-field rule Zod's per-field validators can't express alone. */
export const searchSpecFormSchema = searchSpecSchema.refine(
  (spec) => spec.minYearsExperience <= spec.maxYearsExperience,
  {
    message: 'Minimum experience cannot exceed the maximum.',
    path: ['maxYearsExperience'],
  },
)

export const parseJdResponseSchema = z.object({
  spec: searchSpecSchema,
})

export const providerPlanRowSchema = z.object({
  provider: providerSchema,
  estimatedResults: z.number().int().nonnegative(),
  estimatedCredits: z.number().int().nonnegative(),
})
export type ProviderPlanRow = z.infer<typeof providerPlanRowSchema>

export const providerPlanSchema = z.object({
  rows: z.array(providerPlanRowSchema),
  totalCredits: z.number().int().nonnegative(),
  budgetCredits: z.number().int().nonnegative(),
  currency: z.string().length(3),
})
export type ProviderPlan = z.infer<typeof providerPlanSchema>

export const createSearchResponseSchema = z.object({
  searchId: z.string(),
})

export const runSearchResponseSchema = z.object({
  status: z.literal('running'),
})

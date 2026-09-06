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

/**
 * What the real POST /searches/parse-jd actually returns — mirrors the
 * backend's ParseJdResponseDTO (Backend/dtos/search_dto.py). Far richer than
 * SearchSpec: only the fields the filter-chip form can currently display are
 * typed strictly here, everything else (screening_signals, knockouts,
 * red_flags, compensation, evidence per skill) is real extracted data the UI
 * doesn't show yet — a future pass, not dropped by this schema, just not
 * asserted on since nothing here reads it.
 */
const jdSkillSchema = z.object({ name: z.string() })

export const jdExtractionSchema = z.object({
  role: z.object({
    title: z.string().nullable(),
    level: z.string().nullable(),
  }),
  location: z.object({
    work_mode: z.string().nullable(),
    cities: z.array(z.string()),
    countries: z.array(z.string()),
  }),
  experience: z.object({
    min_years: z.number().int().nullable(),
    max_years: z.number().int().nullable(),
  }),
  skills: z.object({
    must_have: z.array(jdSkillSchema),
    nice_to_have: z.array(jdSkillSchema),
  }),
})
export type JdExtraction = z.infer<typeof jdExtractionSchema>

const LEVEL_TO_SENIORITY: Readonly<Record<string, SearchSpec['seniority']>> = {
  intern: 'intern',
  entry: 'junior',
  mid: 'mid',
  senior: 'senior',
  staff: 'staff',
  principal: 'principal',
  lead: 'lead',
  manager: 'staff',
  senior_manager: 'principal',
  director: 'lead',
  vp: 'lead',
  c_suite: 'lead',
}

/**
 * Adapts the backend's rich extraction down to what the filter-chip form can
 * edit today. A missing/unrecognised field falls back to a safe default
 * rather than failing the whole parse — the recruiter can always correct a
 * wrong chip by hand, but a blocked parse leaves them with nothing to edit.
 */
export function jdExtractionToSearchSpec(extraction: JdExtraction): SearchSpec {
  const location = [...extraction.location.cities, ...extraction.location.countries].join(', ')
  const skills = [...extraction.skills.must_have, ...extraction.skills.nice_to_have].map(
    (skill) => skill.name,
  )

  return {
    title: extraction.role.title ?? '',
    skills: skills.length > 0 ? skills : ['General'],
    seniority: extraction.role.level ? (LEVEL_TO_SENIORITY[extraction.role.level] ?? 'mid') : 'mid',
    location: location.length > 0 ? location : 'Unspecified',
    minYearsExperience: extraction.experience.min_years ?? 0,
    maxYearsExperience: extraction.experience.max_years ?? extraction.experience.min_years ?? 10,
  }
}

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

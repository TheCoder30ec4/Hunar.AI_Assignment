import { z } from 'zod'

import { providerSchema } from '@/shared/types/domain'

/**
 * What POST /searches/parse-jd returns and what the filter-chip form edits.
 * Every field is independently editable — a bad parse on one field (e.g. a
 * garbled seniority guess) must never block editing the others.
 */
export const searchSpecSchema = z.object({
  // Multiple acceptable titles (OR match) — a parsed JD title plus close
  // synonyms the recruiter widens the pool with, editable as separate chips.
  titles: z.array(z.string().min(1)).min(1, 'Add at least one title.'),
  skills: z.array(z.string().min(1)).min(1, 'Add at least one skill.'),
  niceToHaveSkills: z.array(z.string().min(1)),
  seniority: z.enum(['intern', 'junior', 'mid', 'senior', 'staff', 'principal', 'lead']),
  location: z.string().min(1, 'Location is required.'),
  locationRadiusKm: z.number().int().min(0).max(500).nullable(),
  minYearsExperience: z.number().int().min(0).max(40),
  maxYearsExperience: z.number().int().min(0).max(40),
  // "min,max" chips, e.g. "200,2000" — kept as a display string since the
  // recruiter edits/adds ranges as whole chips, not two separate numbers.
  companySizeRanges: z.array(z.string().min(1)),
  excludeCompanies: z.array(z.string().min(1)),
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

/**
 * One line of the SSE stream from POST /searches/parse-jd/stream. The parse
 * is a single LLM call with no real sub-steps — `progress` stages are
 * fabricated on the backend purely to give a sense of motion during the
 * ~2-3s wait, not tied to actual internal state.
 */
export const parseJdStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), stage: z.string(), percent: z.number().int() }),
  z.object({ type: z.literal('result'), data: jdExtractionSchema }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type ParseJdStreamEvent = z.infer<typeof parseJdStreamEventSchema>
export type ParseJdProgressEvent = Extract<ParseJdStreamEvent, { type: 'progress' }>

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
  const mustHave = extraction.skills.must_have.map((skill) => skill.name)
  const niceToHave = extraction.skills.nice_to_have.map((skill) => skill.name)

  return {
    titles: extraction.role.title ? [extraction.role.title] : ['Untitled role'],
    skills: mustHave.length > 0 ? mustHave : ['General'],
    niceToHaveSkills: niceToHave,
    seniority: extraction.role.level ? (LEVEL_TO_SENIORITY[extraction.role.level] ?? 'mid') : 'mid',
    location: location.length > 0 ? location : 'Unspecified',
    // The extraction doesn't produce a radius — recruiters set this by hand
    // once they see the parsed location.
    locationRadiusKm: null,
    minYearsExperience: extraction.experience.min_years ?? 0,
    maxYearsExperience: extraction.experience.max_years ?? extraction.experience.min_years ?? 10,
    // Company-size scoping and exclusions are search-time decisions the
    // recruiter layers on top, not facts the JD states — the extraction
    // has nothing to seed these with.
    companySizeRanges: [],
    excludeCompanies: [],
  }
}

export const providerPlanRowSchema = z.object({
  provider: providerSchema,
  estimatedResults: z.number().int().nonnegative(),
  estimatedCredits: z.number().int().nonnegative(),
  // Only Apollo is wired up on the backend right now — the other three
  // providers still appear in the plan (so the recruiter can see what's
  // coming) but can't be run yet.
  enabled: z.boolean(),
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

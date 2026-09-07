import { z } from 'zod'

/**
 * One extracted answer to one campaign question, for one call. Mirrors
 * PLAN.md's API contract (Answer, §"Core payloads") exactly.
 *
 * `normalised` is the only value ever rendered as a cell — `rawSpan` (the
 * literal transcript text) is available on hover/expand only, never a
 * column. Confidence drives an underline weight in the UI, always paired
 * with a text label so it's never colour/weight alone carrying the meaning.
 */
export const answerSchema = z.object({
  key: z.string(),
  normalised: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  confidence: z.number().min(0).max(1),
  rawSpan: z
    .object({ text: z.string(), startMs: z.number().int(), endMs: z.number().int() })
    .nullable(),
  editedBy: z.string().nullable(),
})
export type Answer = z.infer<typeof answerSchema>

/**
 * A candidate's row in the answer table, plus why they ranked where they
 * did — keyword/skill overlap against the JD (no embeddings: Groq has no
 * embedding model, confirmed live against its own /v1/models list, so
 * ranking and its explanation are the same keyword-overlap computation,
 * not a black-box cosine-similarity score with a separately-generated
 * explanation).
 */
export const rankedCandidateSchema = z.object({
  candidateId: z.string(),
  name: z.string(),
  title: z.string(),
  company: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  stage: z.enum([
    'queued', 'excluded', 'dialing', 'connected', 'qualified',
    'not_a_fit', 'interested', 'scheduled', 'unreachable', 'opted_out',
  ]),
  rank: z.number().int().positive(),
  matchScore: z.number().min(0).max(1),
  // The literal terms from the JD's must-have/nice-to-have skills found in
  // this candidate's profile text — this list IS the ranking explanation,
  // not a separate generated summary of one.
  matchedKeywords: z.array(z.string()),
  answers: z.array(answerSchema),
})
export type RankedCandidate = z.infer<typeof rankedCandidateSchema>

export const campaignAnswersResponseSchema = z.object({
  questionKeys: z.array(z.string()),
  candidates: z.array(rankedCandidateSchema),
})
export type CampaignAnswersResponse = z.infer<typeof campaignAnswersResponseSchema>

/**
 * What GET /campaigns/:id actually returns today (Backend/dtos/campaign_dto.py's
 * CampaignDetailDTO — camelCase on the wire via alias_generator). Leaner than
 * rankedCandidateSchema above: no `answers` (no calling pipeline exists yet,
 * so there are no call-derived answers to show), stage is always 'queued'
 * until a dialer is built.
 */
export const campaignCandidateSchema = z.object({
  candidateId: z.string(),
  name: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  matchScore: z.number().min(0).max(1),
  matchedKeywords: z.array(z.string()),
  rank: z.number().int(),
  stage: z.string(),
  exclusionReason: z.string().nullable(),
  source: z.string(),
})
export type CampaignCandidateRow = z.infer<typeof campaignCandidateSchema>

export const campaignDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  createdAt: z.string(),
  candidateCount: z.number().int().nonnegative(),
  calledCount: z.number().int().nonnegative(),
  connectedCount: z.number().int().nonnegative(),
  qualifiedCount: z.number().int().nonnegative(),
  creditsSpent: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  candidates: z.array(campaignCandidateSchema),
  // Why contacts are empty (e.g. Apollo 403 on the Free plan); null when fine.
  contactNote: z.string().nullable(),
})
export type CampaignDetail = z.infer<typeof campaignDetailSchema>

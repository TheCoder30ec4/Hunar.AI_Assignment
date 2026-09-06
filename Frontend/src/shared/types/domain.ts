import { z } from 'zod'

/** The four people-search providers sitting behind the backend. */
export const providerSchema = z.enum(['pdl', 'apollo', 'proxycurl', 'coresignal'])
export type Provider = z.infer<typeof providerSchema>

export const PROVIDER_LABEL: Readonly<Record<Provider, string>> = {
  pdl: 'People Data Labs',
  apollo: 'Apollo',
  proxycurl: 'Proxycurl',
  coresignal: 'Coresignal',
}

export const callStatusSchema = z.enum([
  'queued',
  'dialing',
  'connected',
  'completed',
  'failed',
  'no_answer',
  'blocked',
])
export type CallStatus = z.infer<typeof callStatusSchema>

/** Signal colour + label pairing. Colour alone never carries the meaning. */
export const CALL_STATUS_TONE: Readonly<
  Record<CallStatus, { tone: 'live' | 'good' | 'bad' | 'cold'; label: string }>
> = {
  queued: { tone: 'cold', label: 'Queued' },
  dialing: { tone: 'live', label: 'Dialing' },
  connected: { tone: 'live', label: 'Connected' },
  completed: { tone: 'good', label: 'Completed' },
  failed: { tone: 'bad', label: 'Failed' },
  no_answer: { tone: 'bad', label: 'No answer' },
  blocked: { tone: 'bad', label: 'Blocked' },
}

/** Where a single field came from, so the results table can attribute per-field. */
export const sourcedFieldSchema = z.object({
  value: z.string(),
  source: providerSchema,
  confidence: z.number().min(0).max(1),
})
export type SourcedField = z.infer<typeof sourcedFieldSchema>

export const candidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  yearsExperience: z.number().int().nonnegative(),
  matchScore: z.number().min(0).max(1),
  sources: z.array(providerSchema).min(1),
  callStatus: callStatusSchema.nullable(),
  lastCallAt: z.string().nullable(),
  suppressed: z.boolean(),
})
export type Candidate = z.infer<typeof candidateSchema>

/**
 * A results page can be partial: some providers answered, some failed.
 * The UI renders what arrived plus a strip naming what is missing.
 */
export const candidatePageSchema = z.object({
  rows: z.array(candidateSchema),
  total: z.number().int().nonnegative(),
  providersSucceeded: z.array(providerSchema),
  providersFailed: z.array(
    z.object({ provider: providerSchema, reason: z.string() }),
  ),
})
export type CandidatePage = z.infer<typeof candidatePageSchema>

export const campaignStatusSchema = z.enum([
  'draft',
  'awaiting_review',
  'running',
  'paused',
  'completed',
])
export type CampaignStatus = z.infer<typeof campaignStatusSchema>

export const campaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: campaignStatusSchema,
  createdAt: z.string(),
  candidateCount: z.number().int().nonnegative(),
  calledCount: z.number().int().nonnegative(),
  connectedCount: z.number().int().nonnegative(),
  qualifiedCount: z.number().int().nonnegative(),
  creditsSpent: z.number().int().nonnegative(),
})
export type Campaign = z.infer<typeof campaignSchema>

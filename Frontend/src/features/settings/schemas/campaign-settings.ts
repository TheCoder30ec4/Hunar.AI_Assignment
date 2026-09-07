import { z } from 'zod'

/** Mirrors Backend/dtos/settings_dto.py CampaignSettingsDTO (camelCase wire). */
export const campaignSettingsSchema = z.object({
  scriptTemplate: z.string().nullable(),
  callingWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
  callingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
  maxAttempts: z.number().int().min(1).max(10),
  allowedDays: z.array(z.string()),
  retryIntervalHours: z.number().int().min(0).max(168),
})
export type CampaignSettings = z.infer<typeof campaignSettingsSchema>

/** Hunar's own AllowedDays enum, in week order. */
export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

/** Hunar's Timezone enum — the subset worth offering. The API accepts many
 * US zones too; these are the ones this product actually calls into. */
export const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Riyadh',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
] as const

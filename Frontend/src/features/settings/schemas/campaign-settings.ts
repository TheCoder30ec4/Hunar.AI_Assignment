import { z } from 'zod'

/** Mirrors Backend/dtos/settings_dto.py CampaignSettingsDTO (camelCase wire). */
export const campaignSettingsSchema = z.object({
  scriptTemplate: z.string().nullable(),
  callingWindowStart: z.string().regex(/^\d{2}:\d{2}$/),
  callingWindowEnd: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
  maxAttempts: z.number().int().min(1).max(10),
  allowedDays: z.array(z.string()),
  // Must match the provider's allowed set — see RETRY_INTERVAL_OPTIONS.
  retryIntervalHours: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12), z.literal(24)]),
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

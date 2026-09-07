import { z } from 'zod'

/** Mirrors Backend/dtos/settings_dto.py SuppressionEntryDTO.
 *
 * There is no raw phone/email here by design: the backend stores only a
 * salted hash (see Backend/core/identifier_hash.py), so a do-not-call list
 * can't itself leak the contact details of people who asked not to be
 * contacted. `identifierPreview` is a hash prefix, purely to tell rows apart.
 */
export const suppressionEntrySchema = z.object({
  id: z.string(),
  identifierType: z.enum(['phone', 'email', 'linkedin']),
  identifierPreview: z.string(),
  reason: z.enum(['dnc_registry', 'opt_out', 'manual', 'bounce']),
  source: z.string().nullable(),
  createdAt: z.string(),
})
export type SuppressionEntry = z.infer<typeof suppressionEntrySchema>

export const suppressionListSchema = z.array(suppressionEntrySchema)

export const REASON_LABEL: Readonly<Record<SuppressionEntry['reason'], string>> = {
  dnc_registry: 'DNC registry',
  opt_out: 'Opted out',
  manual: 'Added manually',
  bounce: 'Bounced',
}

export const TYPE_LABEL: Readonly<Record<SuppressionEntry['identifierType'], string>> = {
  phone: 'Phone',
  email: 'Email',
  linkedin: 'LinkedIn',
}

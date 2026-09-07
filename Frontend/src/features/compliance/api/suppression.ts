import { z } from 'zod'

import { apiFetch } from '@/shared/api/client'

import {
  suppressionEntrySchema,
  suppressionListSchema,
  type SuppressionEntry,
} from '../schemas/suppression'

export function getSuppressionList(signal?: AbortSignal): Promise<SuppressionEntry[]> {
  return apiFetch('/suppression', { schema: suppressionListSchema, signal })
}

export interface AddSuppressionInput {
  readonly identifier_type: SuppressionEntry['identifierType']
  readonly identifier: string
  readonly reason: SuppressionEntry['reason']
  readonly source?: string | null
}

/** Resolves to null when the identifier was already suppressed. */
export function addSuppression(input: AddSuppressionInput): Promise<SuppressionEntry | null> {
  return apiFetch('/suppression', {
    method: 'POST',
    body: input,
    schema: suppressionEntrySchema.nullable(),
  })
}

export async function removeSuppression(entryId: string): Promise<void> {
  await apiFetch(`/suppression/${entryId}`, { method: 'DELETE', schema: z.null() })
}

import { z } from 'zod'

/** Mirrors Backend/dtos/calling_dto.py (camelCase on the wire via alias_generator). */
export const transcriptSegmentSchema = z.object({
  speaker: z.enum(['agent', 'candidate']),
  startMs: z.number().int(),
  endMs: z.number().int(),
  text: z.string(),
})
export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>

export const callAnswerSchema = z.object({ key: z.string(), value: z.string() })
export type CallAnswer = z.infer<typeof callAnswerSchema>

export const callDetailSchema = z.object({
  attemptId: z.string(),
  candidateId: z.string(),
  candidateName: z.string(),
  title: z.string(),
  company: z.string(),
  phone: z.string().nullable(),
  status: z.string(),
  stage: z.string(),
  durationSecs: z.number().int().nullable(),
  recordingUrl: z.string().nullable(),
  answers: z.array(callAnswerSchema),
  // Generated from the recording via Groq Whisper — Hunar's API returns no
  // transcript (confirmed against its OpenAPI spec and a real call).
  transcript: z.array(transcriptSegmentSchema),
})
export type CallDetail = z.infer<typeof callDetailSchema>

export const callDetailListSchema = z.array(callDetailSchema)

/** SSE events from POST /campaigns/:id/calls/stream. */
export const callingStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('progress'),
    stage: z.string(),
    percent: z.number(),
    done: z.number().optional(),
    total: z.number().optional(),
  }),
  z.object({
    type: z.literal('call'),
    attempt_id: z.string(),
    candidate_id: z.string().nullable(),
    status: z.string(),
    stage: z.string().nullable(),
    duration_secs: z.number().nullable().optional(),
    recording_url: z.string().nullable().optional(),
    result: z.record(z.string(), z.unknown()).optional(),
    // True once this call reached a terminal state — its answers are
    // persisted and the row can be refetched. Emitted per call, the moment
    // it finishes, never batched behind slower calls.
    final: z.boolean().optional(),
  }),
  // Transcription finishes after the call is already final, so it arrives
  // as its own event rather than delaying the result.
  z.object({
    type: z.literal('transcript'),
    attempt_id: z.string(),
    candidate_id: z.string().nullable(),
    segments: z.number(),
  }),
  z.object({ type: z.literal('warning'), message: z.string() }),
  z.object({ type: z.literal('error'), message: z.string() }),
])
export type CallingStreamEvent = z.infer<typeof callingStreamEventSchema>

/** Call status -> the tone/label pair the table renders. Colour never carries
 * the meaning alone (see CALL_STATUS_TONE in shared/types/domain.ts). */
export const CALL_STAGE_TONE: Readonly<
  Record<string, { tone: 'live' | 'good' | 'bad' | 'cold' | 'neutral'; label: string }>
> = {
  queued: { tone: 'cold', label: 'queued' },
  dialing: { tone: 'live', label: 'dialing' },
  ringing: { tone: 'live', label: 'ringing' },
  in_progress: { tone: 'live', label: 'in call' },
  completed: { tone: 'good', label: 'connected' },
  connected: { tone: 'good', label: 'connected' },
  qualified: { tone: 'good', label: 'qualified' },
  interested: { tone: 'good', label: 'interested' },
  not_a_fit: { tone: 'bad', label: 'not a fit' },
  no_answer: { tone: 'neutral', label: 'no answer' },
  unreachable: { tone: 'neutral', label: 'no answer' },
  failed: { tone: 'bad', label: 'failed' },
  excluded: { tone: 'neutral', label: 'excluded' },
}

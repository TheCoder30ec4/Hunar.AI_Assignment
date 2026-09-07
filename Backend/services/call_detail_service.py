"""Reads back what a call produced: status, the agent's extracted answers,
and the transcript segments we generated from the recording.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dtos.calling_dto import CallAnswerDTO, CallDetailDTO, TranscriptSegmentDTO
from models.calls import CallAnswer, CallAttempt, CallTranscriptSegment
from models.campaigns import CampaignCandidate
from models.candidates import Candidate


def _answer_value(answer: CallAnswer) -> str:
    """raw_text is the agent's literal answer; the typed columns are for
    querying. Prefer the literal text, fall back to whichever value_* is set.
    """
    if answer.raw_text:
        return answer.raw_text
    for value in (
        answer.value_text,
        answer.value_number,
        answer.value_bool,
        answer.value_duration_days,
    ):
        if value is not None:
            return str(value)
    return "unknown"


async def _build(db: AsyncSession, attempt: CallAttempt, cc: CampaignCandidate, candidate: Candidate) -> CallDetailDTO:
    answers = (
        (
            await db.execute(
                select(CallAnswer)
                .where(CallAnswer.call_attempt_id == attempt.id)
                .order_by(CallAnswer.question_key)
            )
        )
        .scalars()
        .all()
    )
    segments = (
        (
            await db.execute(
                select(CallTranscriptSegment)
                .where(CallTranscriptSegment.call_attempt_id == attempt.id)
                .order_by(CallTranscriptSegment.start_ms)
            )
        )
        .scalars()
        .all()
    )

    return CallDetailDTO(
        attempt_id=str(attempt.id),
        candidate_id=str(candidate.id),
        candidate_name=candidate.full_name,
        title=candidate.current_title or "",
        company=candidate.current_company or "",
        phone=candidate.phone_e164,
        status=attempt.status,
        stage=cc.stage,
        duration_secs=attempt.duration_secs,
        recording_url=attempt.recording_s3_key,
        answers=[CallAnswerDTO(key=a.question_key, value=_answer_value(a)) for a in answers],
        transcript=[
            TranscriptSegmentDTO(
                speaker=s.speaker, start_ms=s.start_ms, end_ms=s.end_ms, text=s.text
            )
            for s in segments
        ],
    )


def _latest_attempts_stmt(campaign_id: uuid.UUID):
    """Most recent attempt per candidate — a redial creates a second row and
    the UI only ever shows the newest."""
    return (
        select(CallAttempt, CampaignCandidate, Candidate)
        .join(CampaignCandidate, CampaignCandidate.id == CallAttempt.campaign_candidate_id)
        .join(Candidate, Candidate.id == CampaignCandidate.candidate_id)
        .where(CampaignCandidate.campaign_id == campaign_id)
        .order_by(Candidate.id, CallAttempt.attempt_no.desc())
        .distinct(Candidate.id)
    )


async def list_call_details(db: AsyncSession, campaign_id: uuid.UUID) -> list[CallDetailDTO]:
    rows = (await db.execute(_latest_attempts_stmt(campaign_id))).all()
    return [await _build(db, attempt, cc, candidate) for attempt, cc, candidate in rows]


async def get_call_detail(
    db: AsyncSession, campaign_id: uuid.UUID, candidate_id: uuid.UUID
) -> CallDetailDTO | None:
    stmt = _latest_attempts_stmt(campaign_id).where(Candidate.id == candidate_id)
    row = (await db.execute(stmt)).first()
    if row is None:
        return None
    attempt, cc, candidate = row
    return await _build(db, attempt, cc, candidate)

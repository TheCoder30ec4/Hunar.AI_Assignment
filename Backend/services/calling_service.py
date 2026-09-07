"""Bulk calling: launch calls for selected campaign candidates, then poll
Hunar until every one reaches a terminal state, persisting each transition.

Why polling rather than Hunar's callback_config webhooks: the callbacks need
a public HTTPS URL Hunar can reach, which localhost isn't. The webhook
receiver is a small addition later (controllers/webhook_controller.py already
exists for Apollo); the poller works today and is what the UI streams from.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import anyio
import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.identifier_hash import hash_identifier
from services.campaign_settings_service import get_campaign_settings, suppressed_hashes
from core.calling_config import (
    CALL_STATUS_MAP,
    POLL_INTERVAL_SECONDS,
    POLL_TIMEOUT_SECONDS,
    RECOMMENDATION_STAGE_MAP,
    TERMINAL_CALL_STATUSES,
)
from models.calls import CallAnswer, CallAttempt, CallTranscriptSegment
from models.campaigns import Campaign, CampaignCandidate
from models.candidates import Candidate
from models.search import Search
from services.hunar_call_service import (
    HunarRateLimitedError,
    HunarServiceError,
    build_custom_data,
    create_bulk_calls,
    get_call,
    normalise_phone,
)
from services.transcription_service import TranscriptionError, transcribe_recording

logger = logging.getLogger(__name__)

# Extra polls (POLL_INTERVAL_SECONDS apart) spent waiting for a completed
# call's recording AND extracted result to appear. Sized against a real 168s
# call whose result took ~1 minute after completion to land: 20 x 4s = 80s.
MAX_ARTIFACT_WAITS = 20

# Spacing between individual GET /calls/{id} requests inside one poll pass.
# Without it, N candidates fire N requests at once and the API answers 429.
PER_CALL_REQUEST_SPACING = 0.35
# Multiplier applied to the poll interval each time a 429 is seen, capped —
# so a rate-limited run slows down instead of hammering.
RATE_LIMIT_BACKOFF = 2.0
MAX_POLL_INTERVAL = 30.0

OnEvent = Callable[[str, dict[str, Any]], Awaitable[None]]

DEFAULT_GUARDRAILS = {
    "allowed_days": ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
    "earliest_call_time": "08:00",
    "last_call_time": "21:00",
}

# Agent result keys that are durations in days, not free text.
_DURATION_KEYS = {"notice_period"}
# Agent result keys that are yes/no.
_BOOL_KEYS = {"interested", "qualified", "can_join_shift"}
_TRUE_WORDS = {"yes", "true", "y", "interested", "qualified", "available"}
_FALSE_WORDS = {"no", "false", "n", "not interested", "unqualified", "unavailable"}


class CampaignNotFoundError(Exception):
    pass


class NoCallableCandidatesError(Exception):
    """Every selected candidate lacks a phone number."""


class CallingFailedError(Exception):
    """The provider rejected the batch — nothing was dialed."""


async def _noop_event(_kind: str, _data: dict[str, Any]) -> None:
    return None


async def _load_callable(
    db: AsyncSession, campaign_id: uuid.UUID, candidate_ids: list[uuid.UUID] | None
) -> tuple[Campaign, list[tuple[CampaignCandidate, Candidate]]]:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFoundError

    stmt = (
        select(CampaignCandidate, Candidate)
        .join(Candidate, Candidate.id == CampaignCandidate.candidate_id)
        .where(
            CampaignCandidate.campaign_id == campaign_id,
            CampaignCandidate.stage != "excluded",
            Candidate.phone_e164.is_not(None),
        )
    )
    if candidate_ids:
        stmt = stmt.where(CampaignCandidate.candidate_id.in_(candidate_ids))

    rows = list((await db.execute(stmt)).all())
    if not rows:
        raise NoCallableCandidatesError
    return campaign, rows


async def start_bulk_calls(
    db: AsyncSession,
    campaign_id: uuid.UUID,
    candidate_ids: list[uuid.UUID] | None,
    on_event: OnEvent = _noop_event,
) -> list[CallAttempt]:
    """Places one call per selected candidate via Hunar's bulk endpoint and
    records a call_attempt per dial. Never optimistic — attempts are written
    only after Hunar confirms the calls were accepted.
    """
    campaign, rows = await _load_callable(db, campaign_id, candidate_ids)

    # Compliance gate: anyone on the suppression list is removed BEFORE the
    # provider is called. This runs on every batch, not just the UI path —
    # a suppressed person must be uncallable regardless of how the call was
    # triggered.
    suppressed = await suppressed_hashes(db)
    if suppressed:
        allowed: list[tuple[CampaignCandidate, Candidate]] = []
        for campaign_candidate, candidate in rows:
            hashes = {
                hash_identifier("phone", candidate.phone_e164 or ""),
                hash_identifier("email", candidate.email or ""),
            }
            if hashes & suppressed:
                campaign_candidate.stage = "excluded"
                campaign_candidate.exclusion_reason = "dnc"
            else:
                allowed.append((campaign_candidate, candidate))
        blocked = len(rows) - len(allowed)
        if blocked:
            await db.flush()
            await on_event(
                "warning",
                {"message": f"{blocked} candidate(s) skipped — on the suppression list."},
            )
        rows = allowed
        if not rows:
            raise NoCallableCandidatesError

    settings = await get_campaign_settings(db, campaign_id)
    guardrails = {
        "allowed_days": settings.allowed_days,
        "earliest_call_time": settings.calling_window_start,
        "last_call_time": settings.calling_window_end,
    }

    # The role being pitched comes from the CAMPAIGN's search (the job the
    # recruiter is hiring for), never from the candidate's own current job.
    job_role = campaign.name
    required_skills = ""
    role_location = ""
    if campaign.search_id is not None:
        search = await db.get(Search, campaign.search_id)
        if search is not None:
            job_role = search.title
            spec = search.spec or {}
            skills = (spec.get("skills") or {}).get("must_have") or []
            required_skills = ", ".join(
                str(skill.get("name")) for skill in skills if skill.get("name")
            )
            cities = (spec.get("location") or {}).get("cities") or []
            role_location = ", ".join(str(city) for city in cities)

    # No employer field exists on a campaign yet, so the campaign name is the
    # best available stand-in for who the recruiter is hiring for.
    hiring_company = campaign.name

    await on_event("progress", {"stage": f"Placing {len(rows)} calls…", "percent": 10})

    recipients = [
        {
            "callee_name": candidate.full_name,
            "mobile_number": candidate.phone_e164,
            "custom_data": build_custom_data(
                candidate_name=candidate.full_name,
                job_role=job_role,
                # The HIRING company and its location — the candidate's own
                # employer/location are what the call is trying to move them
                # away from, so using those would pitch the wrong job.
                company=hiring_company,
                location=role_location or candidate.location_text or "your area",
                required_skills=required_skills,
                extra_instructions=settings.script_template or "",
            ),
        }
        for _, candidate in rows
    ]

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            created = await create_bulk_calls(
                recipients=recipients,
                guardrails=guardrails,
                timezone=settings.timezone,
                retry_config={
                    # max_attempts counts the first dial; the provider counts
                    # RETRIES, so one fewer.
                    "max_retry_count": max(settings.max_attempts - 1, 0),
                    "retry_interval_hours": settings.retry_interval_hours,
                },
                client=client,
            )
        except HunarServiceError as exc:
            raise CallingFailedError(str(exc)) from exc

    # Hunar echoes mobile_number back; that's the only key tying a created
    # call to the candidate it belongs to (it assigns its own call ids).
    # Both sides are normalised: Hunar returns the number stripped of spaces
    # even when the request contained them, so raw-string matching silently
    # drops the candidate.
    by_number = {normalise_phone(row.get("mobile_number")): row for row in created}

    attempts: list[CallAttempt] = []
    unmatched: list[str] = []
    for campaign_candidate, candidate in rows:
        call = by_number.get(normalise_phone(candidate.phone_e164))
        if call is None:
            logger.warning(
                "Hunar returned no call for %s (normalised %s); provider returned %s",
                candidate.phone_e164,
                normalise_phone(candidate.phone_e164),
                list(by_number),
            )
            unmatched.append(candidate.full_name)
            continue

        attempt_no = (
            await db.execute(
                select(func.coalesce(func.max(CallAttempt.attempt_no), 0) + 1).where(
                    CallAttempt.campaign_candidate_id == campaign_candidate.id
                )
            )
        ).scalar_one()

        attempt = CallAttempt(
            campaign_candidate_id=campaign_candidate.id,
            attempt_no=attempt_no,
            provider="hunar",
            provider_call_id=call["id"],
            channel="voice",
            to_number_e164=candidate.phone_e164 or "",
            status=CALL_STATUS_MAP.get(call.get("status", ""), "queued"),
            # The agent's introduction states the call is recorded, and the
            # guardrails window is enforced provider-side.
            consent_recorded=True,
        )
        db.add(attempt)
        campaign_candidate.attempts = attempt_no
        campaign_candidate.stage = "dialing"
        attempts.append(attempt)

    campaign.status = "calling"
    await db.flush()

    if not attempts:
        # Every recipient was rejected by the provider — failing loudly beats
        # a campaign that sits at "queued" forever with no explanation.
        raise CallingFailedError(
            f"The provider accepted no calls for: {', '.join(unmatched) or 'these candidates'}."
        )
    if unmatched:
        await on_event(
            "warning",
            {"message": f"The provider placed no call for: {', '.join(unmatched)}."},
        )

    await on_event("progress", {"stage": f"{len(attempts)} calls queued.", "percent": 25})
    return attempts


def _to_answer_columns(key: str, raw: str) -> dict[str, Any]:
    """Maps one agent result value onto call_answers' exactly-one-value_*
    columns (enforced by ck_call_answers_exactly_one_value).
    """
    text = (raw or "").strip()
    lowered = text.lower()

    if key in _BOOL_KEYS and lowered in _TRUE_WORDS | _FALSE_WORDS:
        return {"value_bool": lowered in _TRUE_WORDS}

    if key in _DURATION_KEYS:
        digits = "".join(ch for ch in text if ch.isdigit())
        if digits:
            days = int(digits)
            if "month" in lowered:
                days *= 30
            elif "week" in lowered:
                days *= 7
            return {"value_duration_days": days}

    if key == "experience_years":
        try:
            return {"value_number": Decimal("".join(ch for ch in text if ch.isdigit() or ch == "."))}
        except (InvalidOperation, ValueError):
            pass

    # Everything else — including "unknown" — stays text. Storing the agent's
    # literal answer beats coercing it into a wrong typed value.
    return {"value_text": text or "unknown"}


async def _persist_result(db: AsyncSession, attempt: CallAttempt, result: dict[str, Any]) -> None:
    existing = set(
        (
            await db.execute(
                select(CallAnswer.question_key).where(CallAnswer.call_attempt_id == attempt.id)
            )
        )
        .scalars()
        .all()
    )
    for key, value in result.items():
        if key in existing or value is None:
            continue
        db.add(
            CallAnswer(
                call_attempt_id=attempt.id,
                question_key=key,
                raw_text=str(value),
                **_to_answer_columns(key, str(value)),
            )
        )


async def _persist_transcript(db: AsyncSession, attempt: CallAttempt, recording_url: str) -> int:
    already = (
        await db.execute(
            select(func.count())
            .select_from(CallTranscriptSegment)
            .where(CallTranscriptSegment.call_attempt_id == attempt.id)
        )
    ).scalar_one()
    if already:
        return already

    try:
        segments = await transcribe_recording(recording_url)
    except TranscriptionError:
        # A missing transcript degrades the detail panel; it never fails the call.
        logger.warning("no transcript for attempt %s", attempt.id)
        return 0

    for segment in segments:
        db.add(CallTranscriptSegment(call_attempt_id=attempt.id, **segment))
    return len(segments)


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


async def _finalise_call(
    db: AsyncSession,
    attempt: CallAttempt,
    call: dict[str, Any],
    hunar_status: str,
    on_event: OnEvent,
) -> None:
    """Everything that happens the moment ONE call reaches a terminal state.

    Deliberately per-call and committed immediately: the recruiter sees each
    candidate's outcome the second it exists, rather than waiting for the
    slowest call in the batch. Transcription runs here too, so a long
    transcription only delays its own row.
    """
    result = call.get("result") or {}
    campaign_candidate = await db.get(CampaignCandidate, attempt.campaign_candidate_id)

    if result:
        await _persist_result(db, attempt, result)

    if campaign_candidate is not None:
        recommendation = str(result.get("recommendation", "")).lower()
        if hunar_status == "COMPLETED":
            campaign_candidate.stage = RECOMMENDATION_STAGE_MAP.get(recommendation, "connected")
        elif hunar_status == "NOT_CONNECTED":
            campaign_candidate.stage = "unreachable"
        else:
            campaign_candidate.stage = "failed" if hunar_status == "FAILED" else "queued"

    # Commit BEFORE transcribing: the status/answers are what the table
    # shows, and they must not wait on a multi-second Whisper round-trip.
    await db.commit()
    await on_event(
        "call",
        {
            "attempt_id": str(attempt.id),
            "candidate_id": str(campaign_candidate.candidate_id) if campaign_candidate else None,
            "status": attempt.status,
            "stage": campaign_candidate.stage if campaign_candidate else None,
            "duration_secs": attempt.duration_secs,
            "recording_url": call.get("recording_url"),
            "result": result,
            "final": True,
        },
    )

    recording_url = call.get("recording_url")
    if recording_url:
        segments = await _persist_transcript(db, attempt, recording_url)
        await db.commit()
        if segments:
            await on_event(
                "transcript",
                {
                    "attempt_id": str(attempt.id),
                    "candidate_id": str(campaign_candidate.candidate_id)
                    if campaign_candidate
                    else None,
                    "segments": segments,
                },
            )


async def poll_until_complete(
    db: AsyncSession, attempt_ids: list[uuid.UUID], on_event: OnEvent = _noop_event
) -> None:
    """Polls Hunar for each in-flight attempt, writing and emitting every
    transition the moment it happens. Returns once all attempts are terminal
    or POLL_TIMEOUT_SECONDS elapses.
    """
    pending = set(attempt_ids)
    started = anyio.current_time()
    total = len(pending)
    artifact_waits: dict[uuid.UUID, int] = {aid: 0 for aid in attempt_ids}
    interval = POLL_INTERVAL_SECONDS

    async with httpx.AsyncClient(timeout=30.0) as client:
        while pending and anyio.current_time() - started < POLL_TIMEOUT_SECONDS:
            await asyncio.sleep(interval)
            rate_limited = False

            for attempt_id in list(pending):
                attempt = await db.get(CallAttempt, attempt_id)
                if attempt is None or attempt.provider_call_id is None:
                    pending.discard(attempt_id)
                    continue

                try:
                    call = await get_call(attempt.provider_call_id, client=client)
                except HunarRateLimitedError:
                    rate_limited = True
                    break  # stop this pass; back off and retry the rest later
                except HunarServiceError:
                    continue  # transient — try again next tick

                # Space requests out so a large batch doesn't trip the limiter.
                await asyncio.sleep(PER_CALL_REQUEST_SPACING)

                hunar_status = call.get("status", "")
                mapped = CALL_STATUS_MAP.get(hunar_status, attempt.status)
                changed = mapped != attempt.status

                attempt.status = mapped
                attempt.duration_secs = int(call.get("duration_seconds") or 0) or None
                attempt.recording_s3_key = call.get("recording_url")
                attempt.started_at = _parse_ts(call.get("started_at")) or attempt.started_at
                attempt.ended_at = _parse_ts(call.get("ended_at")) or attempt.ended_at

                if hunar_status in TERMINAL_CALL_STATUSES:
                    # recording_url AND result are populated a beat after the
                    # status flips to COMPLETED, and they land at different
                    # times — the recording first, the extracted result up to
                    # a minute later while the provider's LLM runs. Waiting on
                    # the recording alone finalised calls with an empty result
                    # and zero answers (confirmed live on a 168s call). Wait
                    # for BOTH before giving up on either.
                    if (
                        hunar_status == "COMPLETED"
                        and not (call.get("recording_url") and call.get("result"))
                        and artifact_waits[attempt_id] < MAX_ARTIFACT_WAITS
                    ):
                        artifact_waits[attempt_id] += 1
                        await db.commit()
                        continue

                    pending.discard(attempt_id)
                    await _finalise_call(db, attempt, call, hunar_status, on_event)

                elif changed:
                    campaign_candidate = await db.get(
                        CampaignCandidate, attempt.campaign_candidate_id
                    )
                    if campaign_candidate is not None:
                        campaign_candidate.stage = "dialing"
                    # Committed per-call so an in-flight status shows up
                    # immediately, not at the end of the pass.
                    await db.commit()
                    await on_event(
                        "call",
                        {
                            "attempt_id": str(attempt.id),
                            "candidate_id": str(campaign_candidate.candidate_id)
                            if campaign_candidate
                            else None,
                            "status": mapped,
                            "stage": campaign_candidate.stage if campaign_candidate else None,
                            "final": False,
                        },
                    )

            interval = (
                min(interval * RATE_LIMIT_BACKOFF, MAX_POLL_INTERVAL)
                if rate_limited
                else POLL_INTERVAL_SECONDS
            )

            done = total - len(pending)
            await on_event(
                "progress",
                {
                    "stage": f"{done} of {total} calls finished",
                    "percent": 25 + int(70 * done / total) if total else 100,
                    "done": done,
                    "total": total,
                },
            )

    await db.commit()


async def run_bulk_calling(
    db: AsyncSession,
    campaign_id: uuid.UUID,
    candidate_ids: list[uuid.UUID] | None,
    on_event: OnEvent = _noop_event,
) -> None:
    """Launch + poll, as one unit. This is what the SSE endpoint drives."""
    attempts = await start_bulk_calls(db, campaign_id, candidate_ids, on_event)
    await db.commit()
    await poll_until_complete(db, [a.id for a in attempts], on_event)

    campaign = await db.get(Campaign, campaign_id)
    if campaign is not None:
        campaign.status = "complete"
        await db.commit()
    await on_event("progress", {"stage": "All calls finished.", "percent": 100})

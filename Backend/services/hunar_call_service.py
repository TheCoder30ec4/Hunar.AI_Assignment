"""Hunar Voice API client: place bulk calls, read call state back.

Shapes confirmed against the live OpenAPI spec and a real completed call on
2026-09-07 (see core/calling_config.py). The agent's prompt templates four
custom variables — candidate_name, job_role, company, location — and the API
rejects a call with 422 "Custom data keys are not present" if any is missing,
so build_custom_data below is not optional decoration.
"""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from core.calling_config import BULK_BATCH_SIZE, HUNAR_BASE_URL, get_calling_settings

logger = logging.getLogger(__name__)


class HunarServiceError(Exception):
    """The Hunar call itself failed (network, 4xx/5xx, unexpected shape)."""


class HunarRateLimitedError(HunarServiceError):
    """429 — the poller must back off rather than retry immediately."""


def _headers() -> dict[str, str]:
    return {
        "X-API-Key": get_calling_settings().hunar_ai_api_key,
        "Content-Type": "application/json",
    }


def normalise_phone(number: str | None) -> str:
    """Strips everything but digits and a leading +.

    Hunar normalises numbers server-side and echoes back the CLEANED form
    ("+916305741824") even when the request sent "+91 6305741824". Matching a
    created call back to its candidate on the raw string therefore misses,
    which silently leaves that candidate queued with no attempt row and no
    error. Both sides go through this before comparison.
    """
    if not number:
        return ""
    cleaned = re.sub(r"[^0-9+]", "", number)
    return "+" + cleaned.lstrip("+") if cleaned else ""


def build_custom_data(
    *,
    candidate_name: str,
    job_role: str,
    company: str,
    location: str,
    required_skills: str = "",
    extra_instructions: str = "",
) -> dict[str, str]:
    """Every key here is templated into the agent's prompt (see
    core/agent_prompt.py) and is REQUIRED — Hunar rejects the call with 422
    "Custom data keys are not present" if one is missing, and an empty string
    would render into the prompt as a blank. Hence readable fallbacks.
    """
    return {
        "candidate_name": candidate_name or "there",
        "job_role": job_role or "this role",
        "company": company or "our client",
        "location": location or "your area",
        "required_skills": required_skills or "the core skills for this role",
        # Campaign-specific additions to the shared script. "None." rather
        # than "" so the templated prompt reads as a complete sentence.
        "extra_instructions": extra_instructions or "None.",
    }


async def create_bulk_calls(
    *,
    recipients: list[dict[str, Any]],
    guardrails: dict[str, Any],
    client: httpx.AsyncClient,
    timezone: str = "Asia/Kolkata",
    retry_config: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """POST /calls/bulk/ in batches of BULK_BATCH_SIZE.

    Each recipient is {callee_name, mobile_number, custom_data}. Returns the
    created call rows (id, status, mobile_number, ...) across all batches.
    remove_invalid_rows=False on purpose: a silently dropped recipient would
    leave a candidate stuck 'queued' forever with no call ever arriving.
    """
    settings = get_calling_settings()
    created: list[dict[str, Any]] = []

    for start in range(0, len(recipients), BULK_BATCH_SIZE):
        batch = recipients[start : start + BULK_BATCH_SIZE]
        payload = {
            "agent_id": settings.hunar_agent_id,
            "data": [
                {**recipient, "mobile_number": normalise_phone(recipient.get("mobile_number"))}
                for recipient in batch
            ],
            "guardrails": guardrails,
            "timezone": timezone,
            # retry_interval_hours must be one of [3, 6, 9, 12, 24] even when no
            # retries are requested — 0 is rejected with a 422, so the "no
            # retries" case is max_retry_count=0 with a valid interval.
            "retry_config": retry_config or {"max_retry_count": 0, "retry_interval_hours": 3},
            "remove_invalid_rows": False,
            "remove_duplicate_phone_numbers": True,
        }
        try:
            response = await client.post(
                f"{HUNAR_BASE_URL}/calls/bulk/", headers=_headers(), json=payload
            )
        except httpx.HTTPError as exc:
            logger.exception("Hunar bulk call request failed")
            raise HunarServiceError(str(exc)) from exc

        if response.status_code >= 400:
            # raise_for_status() drops the body, which is where Hunar puts the
            # actual reason (e.g. missing custom_data keys).
            logger.error("Hunar bulk call rejected: %s %s", response.status_code, response.text[:500])
            raise HunarServiceError(f"{response.status_code}: {response.text[:300]}")

        body = response.json()
        created.extend(body if isinstance(body, list) else [body])

    return created


async def get_call(call_id: str, *, client: httpx.AsyncClient) -> dict[str, Any]:
    """GET /calls/{id}/ — status, duration, recording_url, result."""
    try:
        response = await client.get(f"{HUNAR_BASE_URL}/calls/{call_id}/", headers=_headers())
    except httpx.HTTPError as exc:
        logger.warning("Hunar get-call transport error for %s: %s", call_id, exc)
        raise HunarServiceError(str(exc)) from exc

    if response.status_code == 429:
        # Expected under load — the caller backs off. Not logged as an
        # exception: a stack trace per rate-limited poll buries real errors.
        raise HunarRateLimitedError(call_id)
    if response.status_code >= 400:
        logger.warning("Hunar get-call %s failed: %s", call_id, response.status_code)
        raise HunarServiceError(f"{response.status_code}: {response.text[:200]}")
    return response.json()

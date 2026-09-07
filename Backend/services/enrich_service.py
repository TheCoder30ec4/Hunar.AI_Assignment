"""Enrich.so integration: email validation only. There is no person-search
or LinkedIn-lookup endpoint on this provider (confirmed against their docs
and by testing several guessed paths live) — its only real job in this
pipeline is validating whether an email Apify already returned actually
exists, at 1 credit per check.

Base URL and auth header were both wrong in Enrich.so's own marketing docs
page (docs/api-pricing implied api.enrich.so + Bearer auth; the real
quickstart at dev.enrich.so/api/v3 uses x-api-key) — verified by calling the
real endpoint and reading what worked, not by trusting either doc page.
"""

from __future__ import annotations

import logging

import httpx

from core.provider_config import ENRICH_BASE_URL, ENRICH_EMAIL_VALIDATION_CREDITS, get_provider_settings

logger = logging.getLogger(__name__)

# Enrich.so has no dedicated "check my balance" endpoint (confirmed: /credits,
# /account, /usage, /me, /balance all 404 under /api/v3). Every real
# email-validation response includes meta.creditsRemaining, so that's the
# only live source of truth we have — cache the last value we actually saw
# and refresh it opportunistically on each real call. Seeded from the last
# confirmed-live value as of building this integration (three verification
# calls were made: 100 -> 99 -> 98 -> 97); genuinely stale the moment any
# other process or the dashboard spends credits, corrected on this
# process's first real call.
_last_known_credits_remaining = 97


def get_last_known_credits_remaining() -> int:
    return _last_known_credits_remaining


class EnrichServiceError(Exception):
    """The Enrich.so call itself failed (network, 4xx/5xx, bad shape)."""


async def validate_email(email: str) -> tuple[bool, int]:
    """Returns (is_deliverable, credits_remaining_after_this_call).

    Spends 1 real Enrich.so credit. Never call this speculatively — only for
    an email a provider actually returned that a recruiter is about to see.
    """
    global _last_known_credits_remaining
    settings = get_provider_settings()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{ENRICH_BASE_URL}/email-validation",
                headers={"x-api-key": settings.enrich_api_key, "Content-Type": "application/json"},
                json={"email": email},
            )
            response.raise_for_status()
            body = response.json()
    except httpx.HTTPError as exc:
        logger.exception("Enrich.so email-validation call failed")
        raise EnrichServiceError from exc

    if not body.get("success"):
        raise EnrichServiceError(f"Enrich.so returned success=false: {body}")

    _last_known_credits_remaining = body["meta"]["creditsRemaining"]
    is_deliverable = body["data"]["result"] == "valid"
    return is_deliverable, _last_known_credits_remaining


def estimate_credit_cost(email_count: int) -> int:
    return email_count * ENRICH_EMAIL_VALIDATION_CREDITS

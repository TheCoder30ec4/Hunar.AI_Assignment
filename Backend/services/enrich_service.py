"""Enrich.so integration (https://dev.enrich.so/api/v3, x-api-key auth).
Endpoints confirmed live on 2026-09-07 from doc.enrich.so's sitemap pages:

  GET  /wallets/balance                 free      real remaining credits
  POST /email-finder                    10 cr     firstName+lastName+domain -> email (refunded if not found)
  POST /email-validation                1 cr      email -> valid/invalid
  GET  /reverse-lookup/phones           500 cr    email or linkedin -> phones — 402 on this account (balance 97)

The marketing docs page quoted a different base URL and auth header; the
values above are what actually answered.
"""

from __future__ import annotations

import logging

import httpx

from core.provider_config import (
    ENRICH_BASE_URL,
    ENRICH_EMAIL_FINDER_CREDITS,
    ENRICH_EMAIL_VALIDATION_CREDITS,
    get_provider_settings,
)

logger = logging.getLogger(__name__)

# Last balance any real call in this process saw. Seeded from the live
# /wallets/balance reading when this was written; refreshed by every call
# below and by get_balance() — never the sole source of truth, only the
# fallback when the balance endpoint is unreachable.
_last_known_credits_remaining = 97


def get_last_known_credits_remaining() -> int:
    return _last_known_credits_remaining


def _remember(credits_remaining: int | None) -> None:
    global _last_known_credits_remaining
    if credits_remaining is not None:
        _last_known_credits_remaining = credits_remaining


class EnrichServiceError(Exception):
    """The Enrich.so call itself failed (network, 4xx/5xx, bad shape)."""


def _headers() -> dict[str, str]:
    return {"x-api-key": get_provider_settings().enrich_api_key, "Content-Type": "application/json"}


async def get_balance(*, client: httpx.AsyncClient | None = None) -> int:
    """Live remaining credits. Free call."""
    owned = client is None
    client = client or httpx.AsyncClient(timeout=15.0)
    try:
        response = await client.get(f"{ENRICH_BASE_URL}/wallets/balance", headers=_headers())
        response.raise_for_status()
        balance = int(response.json()["data"]["balance"])
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        logger.exception("Enrich.so balance call failed")
        raise EnrichServiceError from exc
    finally:
        if owned:
            await client.aclose()
    _remember(balance)
    return balance


async def find_email(
    first_name: str, last_name: str, domain: str, *, client: httpx.AsyncClient
) -> tuple[str | None, int]:
    """Returns (email or None, credits_remaining). Charges 10 credits only
    when an email is found — a miss is free, so a wrong domain guess costs
    nothing but the request.
    """
    try:
        response = await client.post(
            f"{ENRICH_BASE_URL}/email-finder",
            headers=_headers(),
            json={"firstName": first_name, "lastName": last_name, "domain": domain},
        )
        response.raise_for_status()
        body = response.json()
    except httpx.HTTPError as exc:
        logger.exception("Enrich.so email-finder call failed")
        raise EnrichServiceError from exc

    if not body.get("success"):
        raise EnrichServiceError(f"Enrich.so returned success=false: {body}")

    remaining = body.get("meta", {}).get("creditsRemaining")
    _remember(remaining)
    data = body.get("data", {})
    return (data.get("email") if data.get("found") else None), remaining if remaining is not None else _last_known_credits_remaining


async def validate_email(email: str, *, client: httpx.AsyncClient | None = None) -> tuple[bool, int]:
    """Returns (is_deliverable, credits_remaining_after_this_call). Spends 1
    credit — only for an email a provider actually returned.
    """
    owned = client is None
    client = client or httpx.AsyncClient(timeout=15.0)
    try:
        response = await client.post(
            f"{ENRICH_BASE_URL}/email-validation", headers=_headers(), json={"email": email}
        )
        response.raise_for_status()
        body = response.json()
    except httpx.HTTPError as exc:
        logger.exception("Enrich.so email-validation call failed")
        raise EnrichServiceError from exc
    finally:
        if owned:
            await client.aclose()

    if not body.get("success"):
        raise EnrichServiceError(f"Enrich.so returned success=false: {body}")

    remaining = body["meta"]["creditsRemaining"]
    _remember(remaining)
    return body["data"]["result"] == "valid", remaining


# Finder + validation for one candidate, worst case.
ENRICH_CREDITS_PER_EMAIL = ENRICH_EMAIL_FINDER_CREDITS + ENRICH_EMAIL_VALIDATION_CREDITS


def estimate_credit_cost(email_count: int) -> int:
    return email_count * ENRICH_CREDITS_PER_EMAIL

"""Apollo.io People Enrichment: LinkedIn URL in, email (sync) + phone (async
via webhook) out. Request shape follows Apollo's own docs verbatim — query
params, not a JSON body (https://docs.apollo.io/reference/people-enrichment).

Status as of wiring this (2026-09-07, tested live with the account's key):
every person endpoint returns 403 API_INACCESSIBLE — "not included in your
Free plan ... All paid plans include full API access". That is a plan-level
block, not a request-shape problem (the exact documented shape was tried).
This service exists so contacts appear the moment the account is upgraded
or swapped for a work-email one; until then the pipeline records the 403 in
search_provider_runs and the UI says why contacts are empty.
"""

from __future__ import annotations

import logging

import httpx
from pydantic import BaseModel

from core.provider_config import get_provider_settings

logger = logging.getLogger(__name__)

APOLLO_PEOPLE_MATCH_URL = "https://api.apollo.io/api/v1/people/match"


class ApolloPerson(BaseModel):
    email: str | None = None
    email_status: str | None = None
    title: str | None = None
    organization_name: str | None = None
    # Populated synchronously only if Apollo already holds the number; new
    # reveals arrive later at the webhook.
    phone: str | None = None


class ApolloNotConfiguredError(Exception):
    """No apollo_io_key in the environment."""


class ApolloInaccessibleError(Exception):
    """403 API_INACCESSIBLE — the account's plan doesn't include this endpoint."""


class ApolloServiceError(Exception):
    """Any other failure (network, 5xx, malformed body)."""


async def enrich_person(linkedin_url: str, *, client: httpx.AsyncClient) -> ApolloPerson | None:
    """Returns None when Apollo has no record for the URL (a valid outcome).
    Spends one Apollo credit per successful match — never call speculatively.
    """
    settings = get_provider_settings()
    if not settings.apollo_io_key:
        raise ApolloNotConfiguredError

    params: dict[str, str] = {
        "linkedin_url": linkedin_url,
        "reveal_personal_emails": "true",
    }
    if settings.apollo_webhook_url:
        params["reveal_phone_number"] = "true"
        params["webhook_url"] = settings.apollo_webhook_url

    try:
        response = await client.post(
            APOLLO_PEOPLE_MATCH_URL,
            params=params,
            headers={
                "x-api-key": settings.apollo_io_key,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Cache-Control": "no-cache",
            },
        )
    except httpx.HTTPError as exc:
        logger.exception("Apollo people/match call failed")
        raise ApolloServiceError from exc

    if response.status_code == 403:
        raise ApolloInaccessibleError(response.text[:300])
    if response.status_code >= 400:
        raise ApolloServiceError(f"{response.status_code}: {response.text[:300]}")

    person = response.json().get("person")
    if not person:
        return None

    phones = person.get("phone_numbers") or []
    return ApolloPerson(
        email=person.get("email"),
        email_status=person.get("email_status"),
        title=person.get("title"),
        organization_name=(person.get("organization") or {}).get("name"),
        phone=(phones[0].get("sanitized_number") if phones else None),
    )

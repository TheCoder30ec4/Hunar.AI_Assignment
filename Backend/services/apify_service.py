"""Apify integration: the LinkedIn People Search actor (memo23/linkedin-
people-search, id xfz4tG0OB6ClIGVGv). This is the only real candidate-search
provider in the pipeline — it returns name/title/company/location/profile
URL per person; Enrich.so (enrich_service.py) separately validates whichever
email it may include.
"""

from __future__ import annotations

import logging

import httpx

from core.provider_config import (
    APIFY_ACTOR_ID,
    APIFY_ACTOR_START_COST_USD,
    APIFY_MAX_RESULTS_CAP,
    APIFY_PROFILE_FOUND_COST_USD,
    get_provider_settings,
)

logger = logging.getLogger(__name__)

APIFY_RUN_SYNC_URL = f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/run-sync-get-dataset-items"


class ApifyServiceError(Exception):
    """The Apify run itself failed (network, 4xx/5xx, timed out)."""


def estimate_cost_usd(results_needed: int) -> float:
    """Confirmed pricing (see core/provider_config.py): one flat actor-start
    charge plus a per-profile charge for each result the actor actually
    finds. This is an estimate — the actor can return fewer profiles than
    requested if LinkedIn's search runs dry, in which case the real charge
    is lower than this number, never higher.
    """
    capped = min(results_needed, APIFY_MAX_RESULTS_CAP)
    return APIFY_ACTOR_START_COST_USD + capped * APIFY_PROFILE_FOUND_COST_USD


async def search_linkedin_people(
    *,
    keywords: str | None = None,
    title: str | None = None,
    location: str | None = None,
    max_results: int,
) -> list[dict]:
    """Runs the actor synchronously and returns its dataset rows directly.
    run-sync-get-dataset-items blocks until the run finishes (or its own
    timeout) — fine for the result counts this app deals with; a
    fire-and-poll flow would be needed for very large runs.
    """
    settings = get_provider_settings()
    capped_max_results = min(max_results, APIFY_MAX_RESULTS_CAP)

    payload: dict[str, object] = {"mode": "public", "maxResults": capped_max_results}
    if keywords:
        payload["keywords"] = keywords
    if title:
        payload["title"] = title
    if location:
        payload["location"] = location

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                APIFY_RUN_SYNC_URL,
                params={"token": settings.apify_api_key},
                json=payload,
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as exc:
        logger.exception("Apify LinkedIn search run failed")
        raise ApifyServiceError from exc

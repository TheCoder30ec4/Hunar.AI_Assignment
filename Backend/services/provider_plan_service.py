"""Computes what a search would actually cost, before spending anything.

Apify runs the LinkedIn search (USD). Apollo.io is the contact provider but
is blocked on the account's Free plan (403, confirmed live) — so Enrich.so's
Email Finder (10 credits, refunded on a miss) plus validation (1 credit) is
what actually produces emails today. Phone numbers: Apollo blocked, and
Enrich.so's phone lookup costs 500 credits against a ~97 balance (402
confirmed live) — unreachable, and the plan says so rather than hiding it.
pdl/coresignal have no integration at all — static disabled rows.
"""

from __future__ import annotations

import logging

from core.provider_config import (
    ENRICH_ACCOUNT_CREDIT_CAP,
    ENRICH_PHONE_FINDER_CREDITS,
)
from dtos.provider_plan_dto import (
    ProviderCostBreakdownDTO,
    ProviderPlanRequestDTO,
    ProviderPlanResponseDTO,
)
from services import apify_service
from services.enrich_service import (
    ENRICH_CREDITS_PER_EMAIL,
    EnrichServiceError,
    get_balance,
    get_last_known_credits_remaining,
)

logger = logging.getLogger(__name__)


async def fetch_enrich_balance() -> int:
    """Live balance, falling back to the last value a real call returned —
    a plan must never fail to render because a balance check hiccupped."""
    try:
        return await get_balance()
    except EnrichServiceError:
        return get_last_known_credits_remaining()


async def build_provider_plan(request: ProviderPlanRequestDTO) -> ProviderPlanResponseDTO:
    results_needed = request.results_needed
    apify_cost_usd = apify_service.estimate_cost_usd(results_needed)
    enrich_credits_remaining = await fetch_enrich_balance()

    # The pipeline stops finding emails once the balance can't cover one
    # more find+validate, so the real ceiling is the smaller of "every
    # result" and "what the balance affords" — quote that, not a number the
    # run could never spend.
    emails_affordable = min(results_needed, enrich_credits_remaining // ENRICH_CREDITS_PER_EMAIL)
    enrich_estimated_credits = emails_affordable * ENRICH_CREDITS_PER_EMAIL

    rows = [
        ProviderCostBreakdownDTO(
            provider="apify",
            enabled=True,
            results=results_needed,
            cost_usd=round(apify_cost_usd, 4),
            note="LinkedIn people search. Cost is a ceiling — the actor may return fewer "
            "profiles than requested, in which case the real charge is lower.",
        ),
        ProviderCostBreakdownDTO(
            provider="enrich",
            enabled=True,
            results=emails_affordable,
            cost_credits=enrich_estimated_credits,
            note=f"Email finder + validation, {ENRICH_CREDITS_PER_EMAIL} credits per email found "
            f"(misses are free). Balance covers up to {emails_affordable} of {results_needed} results. "
            f"Phone lookup needs {ENRICH_PHONE_FINDER_CREDITS} credits per person — "
            f"not possible with {enrich_credits_remaining} remaining.",
        ),
        ProviderCostBreakdownDTO(
            provider="pdl",
            enabled=False,
            results=0,
            note="Not integrated yet.",
        ),
        ProviderCostBreakdownDTO(
            provider="coresignal",
            enabled=False,
            results=0,
            note="Not integrated yet.",
        ),
    ]

    # Enrich.so's per-credit price isn't published — the USD total is
    # Apify's real spend only; credits are reported natively, not converted.
    total_cost_usd = round(apify_cost_usd, 4)

    return ProviderPlanResponseDTO(
        rows=rows,
        total_cost_usd=total_cost_usd,
        enrich_credits_remaining=enrich_credits_remaining,
        enrich_credit_cap=ENRICH_ACCOUNT_CREDIT_CAP,
        # Block only when not even one email can be found+validated — the
        # run itself caps spend per candidate, so a partial balance is fine.
        exceeds_credit_cap=enrich_credits_remaining < ENRICH_CREDITS_PER_EMAIL,
    )

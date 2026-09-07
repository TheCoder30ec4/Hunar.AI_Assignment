"""Computes what a search would actually cost, before spending anything.

Two real providers: Apify runs the LinkedIn search (USD-priced), Enrich.so
validates whichever email each result includes (credit-priced). pdl and
coresignal have no integration at all — they're static disabled rows so the
UI can show "more providers later" without claiming they work.
"""

from __future__ import annotations

from core.provider_config import (
    ENRICH_ACCOUNT_CREDIT_CAP,
    ENRICH_EMAIL_VALIDATION_CREDITS,
)
from dtos.provider_plan_dto import (
    ProviderCostBreakdownDTO,
    ProviderPlanRequestDTO,
    ProviderPlanResponseDTO,
)
from services import apify_service
from services.enrich_service import get_last_known_credits_remaining


def build_provider_plan(request: ProviderPlanRequestDTO) -> ProviderPlanResponseDTO:
    results_needed = request.results_needed

    apify_cost_usd = apify_service.estimate_cost_usd(results_needed)

    # Enrich.so cost is a ceiling, not a guarantee: it only actually validates
    # an email when Apify's result includes one, so real spend is <= this.
    # Quoting the worst case up front is the same call this app makes for
    # Apify's own "actor found fewer than requested" case — never understate
    # a cost the recruiter is about to approve.
    enrich_estimated_credits = results_needed * ENRICH_EMAIL_VALIDATION_CREDITS
    enrich_credits_remaining = get_last_known_credits_remaining()

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
            results=results_needed,
            cost_credits=enrich_estimated_credits,
            note=f"Email validation, 1 credit per result found. "
            f"{enrich_credits_remaining} of {ENRICH_ACCOUNT_CREDIT_CAP} credits remaining.",
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

    # Enrich.so's per-credit price isn't published (no plan-cost page found
    # in their docs) — the USD total below is Apify's real spend only.
    # Enrich.so cost is reported natively in credits (see the "enrich" row
    # above and enrich_credits_remaining/enrich_credit_cap below), not folded
    # into this dollar figure, because there's no confirmed $/credit rate to
    # convert it with.
    total_cost_usd = round(apify_cost_usd, 4)

    return ProviderPlanResponseDTO(
        rows=rows,
        total_cost_usd=total_cost_usd,
        enrich_credits_remaining=enrich_credits_remaining,
        enrich_credit_cap=ENRICH_ACCOUNT_CREDIT_CAP,
        exceeds_credit_cap=enrich_estimated_credits > enrich_credits_remaining,
    )

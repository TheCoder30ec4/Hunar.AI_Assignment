"""build_provider_plan's cost math is the number a recruiter approves before
a real search spends money — get it wrong and either the app under-quotes a
spend or blocks an affordable one. Every price here is a confirmed-live
constant (core/provider_config.py), so these tests only check the arithmetic
combining them, not the prices themselves.
"""

from unittest.mock import patch

from core.provider_config import (
    APIFY_ACTOR_START_COST_USD,
    APIFY_PROFILE_FOUND_COST_USD,
    ENRICH_ACCOUNT_CREDIT_CAP,
)
from dtos.provider_plan_dto import ProviderPlanRequestDTO
from services.provider_plan_service import build_provider_plan


def test_apify_cost_is_actor_start_plus_per_profile() -> None:
    plan = build_provider_plan(ProviderPlanRequestDTO(results_needed=25))
    apify_row = next(row for row in plan.rows if row.provider == "apify")

    expected = round(APIFY_ACTOR_START_COST_USD + 25 * APIFY_PROFILE_FOUND_COST_USD, 4)
    assert apify_row.cost_usd == expected
    assert plan.total_cost_usd == expected


def test_enrich_cost_is_one_credit_per_result() -> None:
    plan = build_provider_plan(ProviderPlanRequestDTO(results_needed=40))
    enrich_row = next(row for row in plan.rows if row.provider == "enrich")
    assert enrich_row.cost_credits == 40


def test_exceeds_credit_cap_when_results_needed_beats_remaining_balance() -> None:
    with patch("services.provider_plan_service.get_last_known_credits_remaining", return_value=50):
        under = build_provider_plan(ProviderPlanRequestDTO(results_needed=50))
        over = build_provider_plan(ProviderPlanRequestDTO(results_needed=51))

    assert under.exceeds_credit_cap is False
    assert over.exceeds_credit_cap is True


def test_disabled_providers_have_no_cost() -> None:
    plan = build_provider_plan(ProviderPlanRequestDTO(results_needed=10))
    for row in plan.rows:
        if not row.enabled:
            assert row.cost_usd is None
            assert row.cost_credits is None


def test_total_cost_usd_never_silently_includes_enrich_credits() -> None:
    """Enrich.so credits and Apify USD are different units with no confirmed
    conversion rate — the total must reflect Apify's spend only, not a
    fabricated sum across units.
    """
    plan = build_provider_plan(ProviderPlanRequestDTO(results_needed=25))
    apify_row = next(row for row in plan.rows if row.provider == "apify")
    assert plan.total_cost_usd == apify_row.cost_usd


def test_credit_cap_matches_the_confirmed_account_constant() -> None:
    plan = build_provider_plan(ProviderPlanRequestDTO(results_needed=1))
    assert plan.enrich_credit_cap == ENRICH_ACCOUNT_CREDIT_CAP == 100

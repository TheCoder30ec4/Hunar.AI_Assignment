"""build_provider_plan's cost math is the number a recruiter approves before
a real search spends money — get it wrong and either the app under-quotes a
spend or blocks an affordable one. Every price here is a confirmed-live
constant (core/provider_config.py), so these tests only check the arithmetic
combining them, not the prices themselves. The live balance call is patched
so the suite never touches the network.
"""

from unittest.mock import AsyncMock, patch

import pytest

from core.provider_config import (
    APIFY_ACTOR_START_COST_USD,
    APIFY_PROFILE_FOUND_COST_USD,
    ENRICH_ACCOUNT_CREDIT_CAP,
)
from dtos.provider_plan_dto import ProviderPlanRequestDTO
from services.enrich_service import ENRICH_CREDITS_PER_EMAIL
from services.provider_plan_service import build_provider_plan

pytestmark = pytest.mark.anyio


def _with_balance(balance: int):
    return patch("services.provider_plan_service.fetch_enrich_balance", new=AsyncMock(return_value=balance))


async def test_apify_cost_is_actor_start_plus_per_profile() -> None:
    with _with_balance(97):
        plan = await build_provider_plan(ProviderPlanRequestDTO(results_needed=25))
    apify_row = next(row for row in plan.rows if row.provider == "apify")

    expected = round(APIFY_ACTOR_START_COST_USD + 25 * APIFY_PROFILE_FOUND_COST_USD, 4)
    assert apify_row.cost_usd == expected
    assert plan.total_cost_usd == expected


async def test_enrich_cost_is_capped_by_what_the_balance_affords() -> None:
    with _with_balance(97):
        plan = await build_provider_plan(ProviderPlanRequestDTO(results_needed=40))
    enrich_row = next(row for row in plan.rows if row.provider == "enrich")
    affordable = 97 // ENRICH_CREDITS_PER_EMAIL
    assert enrich_row.results == affordable
    assert enrich_row.cost_credits == affordable * ENRICH_CREDITS_PER_EMAIL


async def test_enrich_cost_never_exceeds_results_needed() -> None:
    with _with_balance(10_000):
        plan = await build_provider_plan(ProviderPlanRequestDTO(results_needed=3))
    enrich_row = next(row for row in plan.rows if row.provider == "enrich")
    assert enrich_row.results == 3
    assert enrich_row.cost_credits == 3 * ENRICH_CREDITS_PER_EMAIL


async def test_exceeds_credit_cap_only_when_not_one_email_is_affordable() -> None:
    with _with_balance(ENRICH_CREDITS_PER_EMAIL):
        ok = await build_provider_plan(ProviderPlanRequestDTO(results_needed=50))
    with _with_balance(ENRICH_CREDITS_PER_EMAIL - 1):
        blocked = await build_provider_plan(ProviderPlanRequestDTO(results_needed=1))
    assert ok.exceeds_credit_cap is False
    assert blocked.exceeds_credit_cap is True


async def test_disabled_providers_have_no_cost() -> None:
    with _with_balance(97):
        plan = await build_provider_plan(ProviderPlanRequestDTO(results_needed=10))
    for row in plan.rows:
        if not row.enabled:
            assert row.cost_usd is None
            assert row.cost_credits is None


async def test_total_cost_usd_never_silently_includes_enrich_credits() -> None:
    with _with_balance(97):
        plan = await build_provider_plan(ProviderPlanRequestDTO(results_needed=25))
    apify_row = next(row for row in plan.rows if row.provider == "apify")
    assert plan.total_cost_usd == apify_row.cost_usd


async def test_credit_cap_matches_the_confirmed_account_constant() -> None:
    with _with_balance(97):
        plan = await build_provider_plan(ProviderPlanRequestDTO(results_needed=1))
    assert plan.enrich_credit_cap == ENRICH_ACCOUNT_CREDIT_CAP == 100

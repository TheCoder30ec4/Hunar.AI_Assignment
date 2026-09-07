"""Request/response contracts for the provider-plan endpoint: the recruiter
states how many candidates they need, and the plan computes what that
actually costs against each real provider's own pricing.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProviderPlanRequestDTO(BaseModel):
    # The recruiter's input, not a system estimate — "estimated results" used
    # to be a number the backend guessed; now the recruiter states how many
    # candidates they need and the plan prices that exact number.
    results_needed: int = Field(ge=1, le=1000)


class ProviderCostBreakdownDTO(BaseModel):
    provider: str
    enabled: bool
    results: int
    # Apify bills in USD; Enrich.so bills in its own credits. Both are
    # surfaced natively here rather than force-converted into one fake unit —
    # see ProviderPlanResponseDTO.total_cost_usd for the one number that
    # actually sums them (Enrich credits converted to USD only for that
    # single total line, at the account's own $/credit rate).
    cost_usd: float | None = None
    cost_credits: int | None = None
    note: str | None = None


class ProviderPlanResponseDTO(BaseModel):
    rows: list[ProviderCostBreakdownDTO]
    total_cost_usd: float
    # Enrich.so's real remaining balance, fetched live — not cached, since a
    # concurrent search elsewhere could have spent it since the page loaded.
    enrich_credits_remaining: int
    enrich_credit_cap: int
    # True when this exact plan (given results_needed) would spend more
    # Enrich.so credits than the account currently has. The UI disables
    # "Run search" on this, not on a currency total — credits are the actual
    # hard ceiling for this account, not dollars.
    exceeds_credit_cap: bool

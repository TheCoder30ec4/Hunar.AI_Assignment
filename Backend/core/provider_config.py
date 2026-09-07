"""API credentials and pricing constants for the two real people-search
providers. Every price below was confirmed live against the actual provider
APIs on 2026-09-07 — not copied from marketing pages — see the commit that
introduced this file for the raw verification calls. If a provider changes
pricing, these constants drift from reality silently; there is no live
pricing-check call before each search, only before this file was written.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ProviderSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    apify_api_key: str
    enrich_api_key: str
    # .env spells this `apollo_io_key`. Optional: the pipeline degrades to
    # "no contacts" without it rather than refusing to run.
    apollo_io_key: str | None = None
    # Public HTTPS URL Apollo posts async phone results to (see
    # controllers/webhook_controller.py). Unset locally — phone reveal is
    # skipped then, email reveal still works synchronously.
    apollo_webhook_url: str | None = None


@lru_cache
def get_provider_settings() -> ProviderSettings:
    return ProviderSettings()  # type: ignore[call-arg]  # populated from env/.env at runtime


# --- Apify: LinkedIn People Search actor (memo23/linkedin-people-search) ---
# Confirmed via GET https://api.apify.com/v2/acts/xfz4tG0OB6ClIGVGv — the
# actor's own pricingInfos, not a guess. PAY_PER_EVENT model, two events:
APIFY_ACTOR_ID = "xfz4tG0OB6ClIGVGv"
APIFY_ACTOR_START_COST_USD = 0.005  # one-time per run, charged at actor start
APIFY_PROFILE_FOUND_COST_USD = 0.004  # per LinkedIn profile actually returned
APIFY_MAX_RESULTS_CAP = 1000  # the actor's own documented hard cap

# --- Enrich.so: email validation (https://dev.enrich.so/api/v3) ---
# Confirmed via a live POST to /email-validation — the response's own
# meta.creditsUsed, not the marketing docs (which quoted a different, wrong
# base URL and auth header). 1 credit per email checked.
ENRICH_BASE_URL = "https://dev.enrich.so/api/v3"
ENRICH_EMAIL_VALIDATION_CREDITS = 1
# Confirmed against doc.enrich.so/credits-pricing and a live call on
# 2026-09-07: Email Finder is 10 credits, refunded when found=false; Phone
# Finder is 500 credits per lookup — the live call returned 402
# "requires 500 credits, but your balance is 97". Phone lookup is therefore
# unreachable on this account, not merely expensive.
ENRICH_EMAIL_FINDER_CREDITS = 10
ENRICH_PHONE_FINDER_CREDITS = 500

# Confirmed live via GET /email-validation against the real key: the account
# started at exactly 100 credits. This is the account's total lifetime/
# monthly allowance, not derived from any formula — it is what the account
# actually has. Treat as a hard ceiling the app must never let a plan exceed.
ENRICH_ACCOUNT_CREDIT_CAP = 100

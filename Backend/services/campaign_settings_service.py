"""Per-campaign calling settings, and the org-wide suppression list.

Settings live on the `campaigns` row itself (script_template, timezone,
calling window, max_attempts) plus a JSONB `voice_config` for the handful of
options with no dedicated column. Every campaign therefore carries its own
configuration, and start_bulk_calls reads it at dial time.
"""

from __future__ import annotations

import uuid
from datetime import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.default_tenant import DEFAULT_ORG_ID, DEFAULT_USER_ID, ensure_default_tenant
from core.identifier_hash import hash_identifier
from dtos.settings_dto import (
    AddSuppressionRequestDTO,
    CampaignSettingsDTO,
    RetryIntervalHours,
    SuppressionEntryDTO,
)
from models.campaigns import Campaign
from models.compliance import SuppressionList

DEFAULT_ALLOWED_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


class CampaignNotFoundError(Exception):
    pass


def _fmt(value: time | None, fallback: str) -> str:
    return value.strftime("%H:%M") if value else fallback


def _parse(value: str) -> time:
    hour, minute = value.split(":")
    return time(int(hour), int(minute))



def _valid_retry_interval(value: object) -> RetryIntervalHours:
    """voice_config is free-form JSON, so a row written before the provider's
    allowed set was enforced can hold anything (4 was the old default). Snap
    to the nearest allowed value rather than 500ing on read — the campaign is
    still perfectly usable, and dialing would 422 on the stored value.
    """
    allowed = (3, 6, 9, 12, 24)
    if value in allowed:
        return value  # type: ignore[return-value]
    if isinstance(value, int) and not isinstance(value, bool):
        return min(allowed, key=lambda a: (abs(a - value), a))  # type: ignore[return-value]
    return 3

async def get_campaign_settings(db: AsyncSession, campaign_id: uuid.UUID) -> CampaignSettingsDTO:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFoundError

    voice_config = campaign.voice_config or {}
    return CampaignSettingsDTO(
        script_template=campaign.script_template,
        calling_window_start=_fmt(campaign.calling_window_start, "08:00"),
        calling_window_end=_fmt(campaign.calling_window_end, "21:00"),
        timezone=campaign.timezone,
        max_attempts=campaign.max_attempts,
        allowed_days=voice_config.get("allowed_days") or DEFAULT_ALLOWED_DAYS,
        retry_interval_hours=_valid_retry_interval(voice_config.get("retry_interval_hours")),
    )


async def update_campaign_settings(
    db: AsyncSession, campaign_id: uuid.UUID, settings: CampaignSettingsDTO
) -> CampaignSettingsDTO:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFoundError

    campaign.script_template = settings.script_template or None
    campaign.calling_window_start = _parse(settings.calling_window_start)
    campaign.calling_window_end = _parse(settings.calling_window_end)
    campaign.timezone = settings.timezone
    campaign.max_attempts = settings.max_attempts
    # allowed_days/retry_interval_hours have no dedicated column — voice_config
    # is the schema's designated place for provider options like these.
    campaign.voice_config = {
        **(campaign.voice_config or {}),
        "allowed_days": settings.allowed_days,
        "retry_interval_hours": settings.retry_interval_hours,
    }
    await db.flush()
    return await get_campaign_settings(db, campaign_id)


# --- Suppression list -------------------------------------------------------


async def list_suppression(db: AsyncSession) -> list[SuppressionEntryDTO]:
    rows = (
        (
            await db.execute(
                select(SuppressionList)
                .where(SuppressionList.org_id == DEFAULT_ORG_ID)
                .order_by(SuppressionList.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [
        SuppressionEntryDTO(
            id=str(row.id),
            identifier_type=row.identifier_type,
            # Only a prefix: the raw value was never stored, by design.
            identifier_preview=f"{row.identifier_hash[:12]}…",
            reason=row.reason,
            source=row.source,
            created_at=row.created_at,
        )
        for row in rows
    ]


async def add_suppression(
    db: AsyncSession, request: AddSuppressionRequestDTO
) -> SuppressionEntryDTO | None:
    """Returns None when the identifier is already suppressed — re-adding is
    a no-op, not an error (the caller's intent is already satisfied)."""
    await ensure_default_tenant(db)
    identifier_hash = hash_identifier(request.identifier_type, request.identifier)

    existing = (
        await db.execute(
            select(SuppressionList).where(
                SuppressionList.org_id == DEFAULT_ORG_ID,
                SuppressionList.identifier_type == request.identifier_type,
                SuppressionList.identifier_hash == identifier_hash,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return None

    entry = SuppressionList(
        org_id=DEFAULT_ORG_ID,
        identifier_type=request.identifier_type,
        identifier_hash=identifier_hash,
        reason=request.reason,
        source=request.source,
        added_by=DEFAULT_USER_ID,
    )
    db.add(entry)
    await db.flush()
    return SuppressionEntryDTO(
        id=str(entry.id),
        identifier_type=entry.identifier_type,
        identifier_preview=f"{entry.identifier_hash[:12]}…",
        reason=entry.reason,
        source=entry.source,
        created_at=entry.created_at,
    )


async def remove_suppression(db: AsyncSession, entry_id: uuid.UUID) -> bool:
    entry = await db.get(SuppressionList, entry_id)
    if entry is None:
        return False
    await db.delete(entry)
    await db.flush()
    return True


async def suppressed_hashes(db: AsyncSession) -> set[str]:
    """Every suppressed hash for the org, for filtering a call batch."""
    rows = (
        await db.execute(
            select(SuppressionList.identifier_hash).where(
                SuppressionList.org_id == DEFAULT_ORG_ID
            )
        )
    ).scalars()
    return set(rows)


def _self_check() -> None:
    """Run: uv run python -m services.campaign_settings_service"""
    assert _valid_retry_interval(3) == 3
    assert _valid_retry_interval(24) == 24
    assert _valid_retry_interval(4) == 3, "the old default must snap to a valid one"
    assert _valid_retry_interval(5) == 6
    assert _valid_retry_interval(0) == 3
    assert _valid_retry_interval(999) == 24
    assert _valid_retry_interval(None) == 3
    assert _valid_retry_interval("6") == 3, "non-int JSON falls back, never crashes"
    assert _valid_retry_interval(True) == 3, "bool is an int subclass; must not rank as 1"
    # Every result must be something the provider actually accepts.
    for v in (None, 0, 4, 5, 7, 100, "x", True, 3, 24):
        assert _valid_retry_interval(v) in (3, 6, 9, 12, 24)
    print("campaign_settings_service self-check ok")


if __name__ == "__main__":
    _self_check()

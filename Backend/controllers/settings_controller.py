"""HTTP boundary for per-campaign calling settings and the org suppression
list. Validates into DTOs, calls the service, maps exceptions to statuses.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from Database.core import get_db
from dtos.settings_dto import (
    AddSuppressionRequestDTO,
    CampaignSettingsDTO,
    SuppressionEntryDTO,
)
from services.campaign_settings_service import (
    CampaignNotFoundError,
    add_suppression,
    get_campaign_settings,
    list_suppression,
    remove_suppression,
    update_campaign_settings,
)

router = APIRouter(tags=["settings"])


@router.get("/campaigns/{campaign_id}/settings", response_model=CampaignSettingsDTO)
async def read_settings(
    campaign_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> CampaignSettingsDTO:
    try:
        return await get_campaign_settings(db, campaign_id)
    except CampaignNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.") from exc


@router.put("/campaigns/{campaign_id}/settings", response_model=CampaignSettingsDTO)
async def write_settings(
    campaign_id: uuid.UUID, request: CampaignSettingsDTO, db: AsyncSession = Depends(get_db)
) -> CampaignSettingsDTO:
    try:
        return await update_campaign_settings(db, campaign_id, request)
    except CampaignNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.") from exc


@router.get("/suppression", response_model=list[SuppressionEntryDTO])
async def read_suppression(db: AsyncSession = Depends(get_db)) -> list[SuppressionEntryDTO]:
    return await list_suppression(db)


@router.post("/suppression", response_model=SuppressionEntryDTO | None)
async def create_suppression(
    request: AddSuppressionRequestDTO, db: AsyncSession = Depends(get_db)
) -> SuppressionEntryDTO | None:
    """Returns null when the identifier was already suppressed — re-adding is
    a no-op, since the caller's intent is already satisfied."""
    return await add_suppression(db, request)


@router.delete("/suppression/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_suppression(entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    if not await remove_suppression(db, entry_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entry not found.")

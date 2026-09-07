"""HTTP boundary for campaigns: validates the request into a DTO, calls the
service, maps service exceptions to HTTP status codes. No business logic here.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from Database.core import get_db
from dtos.campaign_dto import (
    CampaignDetailDTO,
    CampaignDTO,
    CreateCampaignRequestDTO,
    CreateCampaignResponseDTO,
)
from services.campaign_service import (
    CampaignNotFoundError,
    SearchNotCompleteError,
    SearchNotFoundError,
    create_campaign_from_search,
    get_campaign_detail,
    list_campaigns,
)

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("", response_model=CreateCampaignResponseDTO)
async def create_campaign(
    request: CreateCampaignRequestDTO, db: AsyncSession = Depends(get_db)
) -> CreateCampaignResponseDTO:
    try:
        campaign = await create_campaign_from_search(db, request.search_id, request.candidate_ids, request.name)
    except SearchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found.") from exc
    except SearchNotCompleteError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="The search has not finished running yet."
        ) from exc
    return CreateCampaignResponseDTO(campaignId=str(campaign.id))


@router.get("", response_model=list[CampaignDTO])
async def get_campaigns(db: AsyncSession = Depends(get_db)) -> list[CampaignDTO]:
    return await list_campaigns(db)


@router.get("/{campaign_id}", response_model=CampaignDetailDTO)
async def get_campaign(campaign_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> CampaignDetailDTO:
    try:
        return await get_campaign_detail(db, campaign_id)
    except CampaignNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found.") from exc

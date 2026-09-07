"""HTTP boundary for campaigns: validates the request into a DTO, calls the
service, maps service exceptions to HTTP status codes. No business logic here.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from Database.core import get_db
from dtos.calling_dto import CallDetailDTO, StartCallsRequestDTO
from services.call_detail_service import get_call_detail, list_call_details
from services.calling_jobs import get_job, start_job
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
logger = logging.getLogger(__name__)


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


@router.get("/{campaign_id}/calls", response_model=list[CallDetailDTO])
async def get_campaign_calls(
    campaign_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> list[CallDetailDTO]:
    """Every call placed for this campaign, with answers and transcript."""
    return await list_call_details(db, campaign_id)


@router.get("/{campaign_id}/calls/status")
async def get_calling_status(campaign_id: uuid.UUID) -> dict[str, Any]:
    """Whether a calling run is active for this campaign — lets the UI show
    the right control after a page refresh. Declared BEFORE the
    /{candidate_id} route: FastAPI matches in declaration order, and the
    parameterised route would otherwise swallow the literal "status".
    """
    job = get_job(campaign_id)
    return {"running": job is not None and not job.done, "events": job.events if job else []}


@router.get("/{campaign_id}/calls/{candidate_id}", response_model=CallDetailDTO)
async def get_campaign_call(
    campaign_id: uuid.UUID, candidate_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> CallDetailDTO:
    detail = await get_call_detail(db, campaign_id, candidate_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No call for this candidate.")
    return detail


async def _calling_events(campaign_id: uuid.UUID, candidate_ids: list[uuid.UUID]) -> AsyncIterator[str]:
    """Subscribes to the campaign's background calling job (starting it if
    it isn't running). Disconnecting only ends this stream — the job keeps
    dialing and keeps writing results, and reconnecting replays what was
    missed."""
    job = start_job(campaign_id, candidate_ids)
    async for event in job.subscribe():
        yield f"data: {json.dumps(event)}\n\n"


@router.post("/{campaign_id}/calls/stream")
async def start_calls_stream(
    campaign_id: uuid.UUID, request: StartCallsRequestDTO
) -> StreamingResponse:
    """Places bulk calls and streams every status change, answer set and
    transcript back as it lands. Terminal event is a `progress` at 100 or
    one `error`."""
    return StreamingResponse(
        _calling_events(campaign_id, request.candidate_ids),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

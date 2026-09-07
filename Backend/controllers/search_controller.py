"""HTTP boundary for search: validates the request into a DTO, calls the
service, maps service exceptions to HTTP status codes. No business logic here.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from Database.core import get_db, get_session_factory
from dtos.search_stream_dto import RunSearchErrorEvent, RunSearchProgressEvent, RunSearchResultEvent
from dtos.provider_plan_dto import ProviderPlanRequestDTO, ProviderPlanResponseDTO
from dtos.search_dto import ParseJdRequestDTO, ParseJdResponseDTO
from dtos.search_run_dto import (
    AddCandidateRequestDTO,
    CreateSearchRequestDTO,
    RankedCandidateDTO,
    CreateSearchResponseDTO,
    RunSearchRequestDTO,
    RunSearchResponseDTO,
    SearchResultsResponseDTO,
)
from services.provider_plan_service import build_provider_plan
from services.search_run_service import (
    SearchNotFoundError,
    SearchRunFailedError,
    add_candidate_to_search,
    create_search,
    get_search_results,
    run_search,
)
from services.search_service import (
    JdParseFailedError,
    JdParseMalformedError,
    parse_jd_service,
    stream_parse_jd_service,
)

router = APIRouter(prefix="/searches", tags=["search"])
logger = logging.getLogger(__name__)


@router.post("/parse-jd", response_model=ParseJdResponseDTO)
async def parse_jd(request: ParseJdRequestDTO) -> ParseJdResponseDTO:
    try:
        return await parse_jd_service(request)
    except JdParseFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not parse the job description. Try again.",
        ) from exc
    except JdParseMalformedError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The parser returned an unexpected result. Try again.",
        ) from exc


@router.post("/parse-jd/stream")
async def parse_jd_stream(request: ParseJdRequestDTO) -> StreamingResponse:
    """Same extraction as POST /parse-jd, but as an SSE stream of fabricated
    progress events (see search_service.stream_parse_jd_service) ending in
    one terminal `result` or `error` event. A POST body carries an SSE
    response fine — EventSource can't send a POST body itself, so the
    frontend uses fetch + a manual stream reader instead of new EventSource().
    """
    return StreamingResponse(
        stream_parse_jd_service(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Disable nginx response buffering in front of this, if one ever
            # sits there — otherwise progress events queue up and arrive all
            # at once instead of as they're produced.
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/provider-plan", response_model=ProviderPlanResponseDTO)
async def provider_plan(request: ProviderPlanRequestDTO) -> ProviderPlanResponseDTO:
    """Real cost math for the results count the recruiter states they need —
    see services/provider_plan_service.py. Reads Enrich.so's live balance
    (one free call) so the quote reflects what the account actually has.
    """
    return await build_provider_plan(request)


@router.post("", response_model=CreateSearchResponseDTO)
async def create_search_endpoint(
    request: CreateSearchRequestDTO, db: AsyncSession = Depends(get_db)
) -> CreateSearchResponseDTO:
    search = await create_search(db, request)
    return CreateSearchResponseDTO(search_id=str(search.id))


@router.post("/{search_id}/run", response_model=RunSearchResponseDTO)
async def run_search_endpoint(
    search_id: uuid.UUID, request: RunSearchRequestDTO, db: AsyncSession = Depends(get_db)
) -> RunSearchResponseDTO:
    try:
        candidates_found, _contacts_found = await run_search(db, search_id, request.results_needed)
        credits_spent = candidates_found
    except SearchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found.") from exc
    except SearchRunFailedError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The candidate search provider failed. Try again.",
        ) from exc
    return RunSearchResponseDTO(
        status="complete", candidates_found=candidates_found, credits_spent=credits_spent
    )


SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


async def _run_search_events(search_id: uuid.UUID, results_needed: int) -> AsyncIterator[str]:
    """Runs the search, streaming each real pipeline stage as it happens.
    Owns its own DB session rather than Depends(get_db):
    a yield-dependency's commit fires when the endpoint returns, which for a
    StreamingResponse is before this generator has run a single line.
    """
    queue: asyncio.Queue[RunSearchProgressEvent | RunSearchResultEvent | RunSearchErrorEvent] = asyncio.Queue()

    async def on_stage(stage: str, percent: int) -> None:
        await queue.put(RunSearchProgressEvent(stage=stage, percent=percent))

    async def pipeline() -> None:
        async with get_session_factory()() as db:
            try:
                candidates_found, contacts_found = await run_search(db, search_id, results_needed, on_stage)
                await db.commit()
                await queue.put(RunSearchResultEvent(
                    search_id=str(search_id), candidates_found=candidates_found, contacts_found=contacts_found,
                ))
            except SearchNotFoundError:
                await db.rollback()
                await queue.put(RunSearchErrorEvent(message="Search not found."))
            except SearchRunFailedError:
                await db.commit()  # keep status='failed' on the search row
                await queue.put(RunSearchErrorEvent(message="The candidate search provider failed. Try again."))
            except Exception:
                logger.exception("search run pipeline crashed")
                await db.rollback()
                await queue.put(RunSearchErrorEvent(message="The search failed unexpectedly. Try again."))

    task = asyncio.create_task(pipeline())
    try:
        while True:
            event = await queue.get()
            yield f"data: {event.model_dump_json()}\n\n"
            if event.type != "progress":
                break
    finally:
        await task


@router.post("/{search_id}/run/stream")
async def run_search_stream(search_id: uuid.UUID, request: RunSearchRequestDTO) -> StreamingResponse:
    """SSE variant of POST /{search_id}/run. Terminal event is one `result`
    or one `error`; the recruiter then picks candidates on the results page."""
    return StreamingResponse(
        _run_search_events(search_id, request.results_needed),
        media_type="text/event-stream",
        headers=SSE_HEADERS,
    )


@router.get("/{search_id}/results", response_model=SearchResultsResponseDTO)
async def get_search_results_endpoint(
    search_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> SearchResultsResponseDTO:
    try:
        search, rows = await get_search_results(db, search_id)
    except SearchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found.") from exc
    return SearchResultsResponseDTO(
        search_id=str(search.id), status=search.status, rows=rows, total=len(rows)
    )


@router.post("/{search_id}/candidates", response_model=RankedCandidateDTO)
async def add_candidate_endpoint(
    search_id: uuid.UUID, request: AddCandidateRequestDTO, db: AsyncSession = Depends(get_db)
) -> RankedCandidateDTO:
    """Manual add — the recruiter types a person in (with their contact
    details) and they're ranked into this search like anyone else."""
    try:
        return await add_candidate_to_search(db, search_id, request)
    except SearchNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Search not found.") from exc

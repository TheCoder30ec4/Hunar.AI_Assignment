"""HTTP boundary for search: validates the request into a DTO, calls the
service, maps service exceptions to HTTP status codes. No business logic here.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from dtos.search_dto import ParseJdRequestDTO, ParseJdResponseDTO
from services.search_service import (
    JdParseFailedError,
    JdParseMalformedError,
    parse_jd_service,
    stream_parse_jd_service,
)

router = APIRouter(prefix="/searches", tags=["search"])


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

"""HTTP boundary for search: validates the request into a DTO, calls the
service, maps service exceptions to HTTP status codes. No business logic here.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from dtos.search_dto import ParseJdRequestDTO, ParseJdResponseDTO
from services.search_service import JdParseFailedError, JdParseMalformedError, parse_jd_service

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

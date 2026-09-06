"""Wraps JD_parse_service: runs the blocking LLM call off the event loop and
validates its output before anything downstream ever sees it.

The model returns free-form JSON from a prompt, not a typed API response —
treat it exactly like third-party provider data. A malformed or drifted
extraction must produce a clear 502, never a component-level crash on
whatever shape happened to come back.
"""

from __future__ import annotations

import logging

from anyio import to_thread
from pydantic import ValidationError

from dtos.search_dto import ParseJdRequestDTO, ParseJdResponseDTO
from services.JD_Parse_service import JD_parse_service

logger = logging.getLogger(__name__)


class JdParseFailedError(Exception):
    """The model call itself failed (timeout, API error, etc.)."""


class JdParseMalformedError(Exception):
    """The model returned JSON that doesn't match ParseJdResponseDTO — a
    prompt drift or a model having an off day, not a client error.
    """


async def parse_jd_service(request: ParseJdRequestDTO) -> ParseJdResponseDTO:
    try:
        # JD_parse_service is a synchronous, blocking LLM call — running it
        # directly here would stall every other request this worker is
        # handling. to_thread hands it to a worker thread instead.
        raw_result = await to_thread.run_sync(JD_parse_service, request.jd_text)
    except Exception as exc:
        logger.exception("JD parse model call failed")
        raise JdParseFailedError from exc

    try:
        return ParseJdResponseDTO.model_validate(raw_result)
    except ValidationError as exc:
        logger.error("JD parse returned a shape that doesn't match ParseJdResponseDTO: %s", raw_result)
        raise JdParseMalformedError from exc

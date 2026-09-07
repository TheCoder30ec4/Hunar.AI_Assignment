"""Wraps JD_parse_service: runs the blocking LLM call off the event loop and
validates its output before anything downstream ever sees it.

The model returns free-form JSON from a prompt, not a typed API response —
treat it exactly like third-party provider data. A malformed or drifted
extraction must produce a clear 502, never a component-level crash on
whatever shape happened to come back.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator

import anyio
from anyio import to_thread
from pydantic import ValidationError

from dtos.search_dto import ParseJdRequestDTO, ParseJdResponseDTO
from dtos.search_stream_dto import ParseJdErrorEvent, ParseJdProgressEvent, ParseJdResultEvent
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


# Fabricated stage labels: the parse is one LLM call with no real internal
# steps, so these exist purely to give the user a sense of progress rather
# than a blank wait. (stage label, percent, seconds after stream start).
# Timed against the ~2.5-3s typical parse latency — see
# services/JD_Parse_service.py's reasoning_effort note for that baseline.
_PROGRESS_SCRIPT = (
    ("Reading job description…", 15, 0.0),
    ("Extracting requirements…", 45, 0.8),
    ("Identifying must-have skills…", 70, 1.6),
    ("Finalising…", 90, 2.4),
)


async def stream_parse_jd_service(request: ParseJdRequestDTO) -> AsyncIterator[str]:
    """SSE body: fabricated progress events while the real parse runs in the
    background, then exactly one terminal `result` or `error` event.

    The progress schedule and the real parse run concurrently, not
    sequentially — a slow parse doesn't get stuck waiting on fake stages, and
    a fast one doesn't skip straight to 100% with no visible progress.
    """
    parse_task = asyncio.ensure_future(parse_jd_service(request))
    start = anyio.current_time()

    try:
        for stage, percent, at_seconds in _PROGRESS_SCRIPT:
            remaining = at_seconds - (anyio.current_time() - start)
            if remaining > 0:
                # Stop waiting early if the real parse already finished —
                # no reason to hold a completed result hostage to the script.
                done, _ = await asyncio.wait([parse_task], timeout=remaining)
                if parse_task in done:
                    break
            yield _sse(ParseJdProgressEvent(stage=stage, percent=percent))

        result = await parse_task
        yield _sse(ParseJdResultEvent(data=result))

    except (JdParseFailedError, JdParseMalformedError):
        yield _sse(ParseJdErrorEvent(message="Could not parse the job description. Try again."))


def _sse(event: ParseJdProgressEvent | ParseJdResultEvent | ParseJdErrorEvent) -> str:
    return f"data: {event.model_dump_json()}\n\n"

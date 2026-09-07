"""Event payloads for the SSE parse-jd stream. Every event is a JSON object
on its own `data:` line — see controllers/search_controller.py for the
actual SSE framing.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from dtos.search_dto import ParseJdResponseDTO


class ParseJdProgressEvent(BaseModel):
    type: Literal["progress"] = "progress"
    stage: str
    percent: int


class ParseJdResultEvent(BaseModel):
    type: Literal["result"] = "result"
    data: ParseJdResponseDTO


class ParseJdErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str


# --- POST /searches/{id}/run/stream ---
# Unlike the parse-jd stages above, these are REAL pipeline steps
# (services/search_run_service.py emits them as it reaches each one).


class RunSearchProgressEvent(BaseModel):
    type: Literal["progress"] = "progress"
    stage: str
    percent: int


class RunSearchResultEvent(BaseModel):
    type: Literal["result"] = "result"
    search_id: str
    candidates_found: int
    contacts_found: int


class RunSearchErrorEvent(BaseModel):
    type: Literal["error"] = "error"
    message: str

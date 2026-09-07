"""Request/response contracts for bulk calling. Response fields are camelCase
on the wire (matching campaign_dto.py's convention) since the frontend
consumes them alongside campaign data.
"""

from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class StartCallsRequestDTO(BaseModel):
    # Empty/omitted means "every callable candidate in the campaign".
    candidate_ids: list[uuid.UUID] = Field(default_factory=list)


class TranscriptSegmentDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    speaker: str
    start_ms: int
    end_ms: int
    text: str


class CallAnswerDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    key: str
    # The literal agent answer. Typed value_* columns exist in the DB for
    # querying; the UI renders what was actually said.
    value: str


class CallDetailDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    attempt_id: str
    candidate_id: str
    candidate_name: str
    title: str
    company: str
    phone: str | None
    status: str
    stage: str
    duration_secs: int | None
    recording_url: str | None
    answers: list[CallAnswerDTO]
    transcript: list[TranscriptSegmentDTO]

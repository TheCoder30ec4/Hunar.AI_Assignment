"""Request/response contracts for campaigns. Response fields are camelCase
on the wire (alias_generator) to match the frontend's existing
campaignSchema (Frontend/src/shared/types/domain.ts) — that schema predates
this DTO and is used in several places already, so this DTO conforms to it
rather than the other way around.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CreateCampaignRequestDTO(BaseModel):
    search_id: uuid.UUID
    # The recruiter's hand-picked rows. The service then runs the clean
    # check: anyone without a phone or email is kept but stage='excluded'
    # (reason 'no_contact') so the dialer never sees them.
    candidate_ids: list[uuid.UUID]
    name: str | None = None


class CreateCampaignResponseDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    campaign_id: str


class CampaignDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str
    status: str
    created_at: datetime
    candidate_count: int
    called_count: int
    connected_count: int
    qualified_count: int
    credits_spent: int
    # Picked by the recruiter but failed the clean check (no phone/email).
    excluded_count: int


class CampaignCandidateDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    candidate_id: str
    name: str
    title: str
    company: str
    location: str
    phone: str | None
    email: str | None
    linkedin_url: str | None
    match_score: float
    matched_keywords: list[str]
    rank: int
    stage: str
    exclusion_reason: str | None
    source: str


class CampaignDetailDTO(CampaignDTO):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    candidates: list[CampaignCandidateDTO]
    # Why contacts may be empty — e.g. Apollo returned 403 on the account's
    # plan. None when enrichment ran cleanly (or wasn't attempted).
    contact_note: str | None = None

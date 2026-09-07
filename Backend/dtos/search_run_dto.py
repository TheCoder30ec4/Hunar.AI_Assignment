"""Request/response contracts for creating and running a search: persist the
parsed JD spec, fan out to Apify, rank what comes back, store it.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from dtos.search_dto import ParseJdResponseDTO


class CreateSearchRequestDTO(BaseModel):
    title: str = Field(min_length=1)
    jd_text: str = Field(min_length=1)
    spec: ParseJdResponseDTO


class CreateSearchResponseDTO(BaseModel):
    search_id: str


class RunSearchRequestDTO(BaseModel):
    # The recruiter states this on the provider-plan screen, which is shown
    # only after the search row already exists — so it's a run-time input,
    # not a create-time one.
    results_needed: int = Field(ge=1, le=1000)


class RunSearchResponseDTO(BaseModel):
    status: str
    candidates_found: int
    credits_spent: int


class AddCandidateRequestDTO(BaseModel):
    """A person added by hand to a search — the manual path that exists
    because no contact provider is reachable on the current accounts."""

    full_name: str = Field(min_length=1)
    title: str | None = None
    company: str | None = None
    location: str | None = None
    phone: str | None = None
    email: str | None = None
    linkedin_url: str | None = None
    about: str | None = None


class RankedCandidateDTO(BaseModel):
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
    # Provider-sourced rows (Apify) vs seeded/manual ones — the UI labels them.
    source: str


class SearchResultsResponseDTO(BaseModel):
    search_id: str
    status: str
    rows: list[RankedCandidateDTO]
    total: int

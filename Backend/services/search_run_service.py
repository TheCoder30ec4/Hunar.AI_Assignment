"""Runs a search end to end: persist the spec, call Apify, upsert candidates,
rank each against the JD by keyword overlap, store the ranking in
search_results. No embeddings — see candidate_ranking_service.py.
"""

from __future__ import annotations

import logging
import re
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

import httpx
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from core.default_tenant import DEFAULT_ORG_ID, DEFAULT_USER_ID, ensure_default_tenant
from core.seed_candidates import ensure_seed_candidates
from dtos.search_dto import ParseJdResponseDTO
from dtos.search_run_dto import AddCandidateRequestDTO, CreateSearchRequestDTO, RankedCandidateDTO
from models.candidates import Candidate, SearchResult
from models.search import Search, SearchProviderRun
from services.apify_service import ApifyServiceError, search_linkedin_people
from services.apollo_service import (
    ApolloInaccessibleError,
    ApolloNotConfiguredError,
    ApolloServiceError,
    enrich_person,
)
from services.candidate_ranking_service import rank_candidate
from services.enrich_service import (
    ENRICH_CREDITS_PER_EMAIL,
    EnrichServiceError,
    find_email,
    get_balance,
    validate_email,
)
from services.profile_extract_service import ExtractedProfile, extract_profiles

logger = logging.getLogger(__name__)

_SLUG_FROM_URL = re.compile(r"linkedin\.com/in/([^/?]+)")

# Apify's public-search actor never populates currentCompany directly
# (confirmed live: always null) — but summary/roleFromSummary consistently
# read "<title> at <company>" or "<title> - <company>", so split it out
# rather than showing the raw combined string as if it were only a title.
_TITLE_AT_COMPANY = re.compile(r"^(.*?)\s+(?:at|-)\s+(.+)$")


class SearchNotFoundError(Exception):
    pass


class SearchRunFailedError(Exception):
    """The provider call itself failed — the search is marked failed, not left running."""


async def create_search(db: AsyncSession, request: CreateSearchRequestDTO) -> Search:
    await ensure_default_tenant(db)
    await ensure_seed_candidates(db)
    search = Search(
        org_id=DEFAULT_ORG_ID,
        created_by=DEFAULT_USER_ID,
        title=request.title,
        jd_text=request.jd_text,
        spec=request.spec.model_dump(mode="json"),
        status="draft",
        # Placeholder — the real count is a run-time input (see
        # RunSearchRequestDTO) since the provider-plan screen where the
        # recruiter states it only appears after this row already exists.
        credits_budget=1,
    )
    db.add(search)
    await db.flush()
    return search


def _slug_from_url(url: str | None) -> str | None:
    if not url:
        return None
    match = _SLUG_FROM_URL.search(url)
    return match.group(1) if match else None


def _candidate_text(row: dict) -> str:
    """Everything Apify gave us that could plausibly contain a skill term."""
    parts = [
        row.get("name") or "",
        row.get("jobTitle") or "",
        row.get("summary") or "",
        row.get("roleFromSummary") or "",
        row.get("about") or "",
        row.get("currentCompany") or "",
    ]
    return " ".join(parts)


async def _upsert_candidate(db: AsyncSession, row: dict, extracted: ExtractedProfile) -> Candidate:
    """Dedup on linkedin_slug within the org — the actor's only stable
    identifier (urnId/email are consistently null in public mode).
    """
    slug = _slug_from_url(row.get("profileUrl"))
    combined = row.get("jobTitle") or row.get("roleFromSummary") or row.get("summary")
    title, company = extracted.title, extracted.company
    if title is None and combined:
        # LLM extraction failed for this row — fall back to the cheap split.
        match = _TITLE_AT_COMPANY.match(combined)
        title, company = (match.group(1).strip(), match.group(2).strip()) if match else (combined, None)

    values = {
        "org_id": DEFAULT_ORG_ID,
        "full_name": row.get("name") or "Unknown",
        "headline": row.get("summary"),
        "current_title": title,
        "current_company": row.get("currentCompany") or company,
        "location_text": row.get("location") or extracted.location,
        "linkedin_url": row.get("profileUrl"),
        "linkedin_slug": slug,
        "raw_profile": row,
    }

    if slug is not None:
        stmt = (
            pg_insert(Candidate)
            .values(**values)
            .on_conflict_do_update(
                constraint="uq_candidates_org_linkedin_slug",
                set_={
                    "headline": values["headline"],
                    "current_title": values["current_title"],
                    "current_company": values["current_company"],
                    "location_text": values["location_text"],
                    "raw_profile": values["raw_profile"],
                    "updated_at": func.now(),
                },
            )
            .returning(Candidate)
        )
        result = await db.execute(stmt)
        return result.scalar_one()

    # No usable slug (malformed profile URL) — insert a plain row, no dedup key to match on.
    candidate = Candidate(**values)
    db.add(candidate)
    await db.flush()
    return candidate


OnStage = Callable[[str, int], Awaitable[None]]


async def _noop_stage(_stage: str, _percent: int) -> None:
    return None


async def _enrich_contacts(
    db: AsyncSession, search: Search, candidates: list[Candidate], on_stage: OnStage
) -> int:
    """Apollo people/match per candidate. Stops at the first 403 (plan-level
    block hits every call identically — no point burning 24 more requests)
    and records the outcome in search_provider_runs so the UI can say why
    contacts are empty. Returns how many candidates got an email or phone.
    """
    run = SearchProviderRun(search_id=search.id, provider="apollo", status="running",
                            started_at=datetime.now(timezone.utc), request_payload={"count": len(candidates)})
    db.add(run)
    await db.flush()

    found = 0
    error: dict | None = None
    async with httpx.AsyncClient(timeout=20.0) as client:
        for index, candidate in enumerate(candidates, start=1):
            if not candidate.linkedin_url:
                continue
            await on_stage(f"Looking up contacts via Apollo ({index}/{len(candidates)})…", 70 + int(15 * index / len(candidates)))
            try:
                person = await enrich_person(candidate.linkedin_url, client=client)
            except ApolloNotConfiguredError:
                error = {"code": "NOT_CONFIGURED", "message": "No Apollo API key configured."}
                break
            except ApolloInaccessibleError as exc:
                error = {"code": "API_INACCESSIBLE", "message": str(exc)}
                break
            except ApolloServiceError as exc:
                logger.warning("Apollo enrichment failed for %s: %s", candidate.linkedin_url, exc)
                continue
            if person is None:
                continue
            if person.email:
                candidate.email = person.email
                candidate.email_verified = person.email_status == "verified"
            if person.phone:
                candidate.phone_e164 = person.phone
            if person.title and not candidate.current_title:
                candidate.current_title = person.title
            if person.organization_name and not candidate.current_company:
                candidate.current_company = person.organization_name
            if person.email or person.phone:
                found += 1

    run.status = "failed" if error else "complete"
    run.error = error
    run.records_returned = found
    run.completed_at = datetime.now(timezone.utc)
    await db.flush()
    return found


def _split_name(full_name: str) -> tuple[str, str] | None:
    parts = full_name.split()
    if len(parts) < 2:
        return None
    return parts[0], " ".join(parts[1:])


async def _find_emails(
    candidates: list[tuple[Candidate, ExtractedProfile]], on_stage: OnStage
) -> int:
    """Enrich.so Email Finder for every candidate still missing an email,
    using the LLM-guessed employer domain. Stops when the balance can't
    cover one more find+validate — the plan quoted exactly this ceiling.
    Returns how many emails were found.
    """
    found = 0
    eligible = [
        (c, p) for c, p in candidates
        if not c.email and p.company_domain and _split_name(c.full_name)
    ]
    if not eligible:
        return 0

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            balance = await get_balance(client=client)
        except EnrichServiceError:
            return 0
        for index, (candidate, profile) in enumerate(eligible, start=1):
            if balance < ENRICH_CREDITS_PER_EMAIL:
                break
            await on_stage(
                f"Finding emails via Enrich.so ({index}/{len(eligible)})…",
                85 + int(4 * index / len(eligible)),
            )
            first, last = _split_name(candidate.full_name)  # type: ignore[misc]  # filtered above
            try:
                email, balance = await find_email(first, last, profile.company_domain or "", client=client)
                if email is None:
                    continue
                is_valid, balance = await validate_email(email, client=client)
            except EnrichServiceError:
                continue
            candidate.email = email
            candidate.email_verified = is_valid
            found += 1
    return found


async def run_search(
    db: AsyncSession, search_id: uuid.UUID, results_needed: int, on_stage: OnStage = _noop_stage
) -> tuple[int, int]:
    """Executes the search: Apify fetch, title/company extraction, candidate
    upsert, Apollo contact enrichment, rank, persist. on_stage receives real
    progress (label, percent) — these are actual pipeline steps, not a
    fabricated script like parse-jd's. Returns (candidates_found, contacts_found).
    """
    search = await db.get(Search, search_id)
    if search is None:
        raise SearchNotFoundError

    spec = ParseJdResponseDTO.model_validate(search.spec)
    must_have = [s.name for s in spec.skills.must_have]
    keywords = " ".join(must_have) or spec.role.title or ""

    search.status = "running"
    search.credits_budget = results_needed
    await db.flush()

    await on_stage("Searching LinkedIn profiles via Apify…", 5)
    try:
        rows = await search_linkedin_people(
            keywords=keywords or None,
            title=spec.role.title,
            location=spec.location.cities[0] if spec.location.cities else None,
            max_results=results_needed,
        )
    except ApifyServiceError as exc:
        search.status = "failed"
        await db.flush()
        raise SearchRunFailedError from exc

    await on_stage(f"Found {len(rows)} profiles. Extracting current roles…", 40)
    extracted = await extract_profiles(rows)

    await on_stage("Saving candidates…", 60)
    ranked: list[tuple[Candidate, float, list[str]]] = []
    with_profiles: list[tuple[Candidate, ExtractedProfile]] = []
    for row, profile in zip(rows, extracted, strict=True):
        candidate = await _upsert_candidate(db, row, profile)
        score, matched = rank_candidate(candidate_text=_candidate_text(row), spec=spec)
        ranked.append((candidate, score, matched))
        with_profiles.append((candidate, profile))

    # Apollo first (email + phone in one call when the plan allows it), then
    # Enrich.so's Email Finder for whoever is still missing an email.
    contacts_found = await _enrich_contacts(db, search, [c for c, _, _ in ranked], on_stage)
    contacts_found += await _find_emails(with_profiles, on_stage)
    await db.flush()

    # Saved contacts (seeded + manually added people, anyone with a phone or
    # email already on file) are ranked against every search too — with the
    # providers blocked, they are the only rows the dialer can actually use.
    found_ids = {c.id for c, _, _ in ranked}
    saved = (
        await db.execute(
            select(Candidate).where(
                Candidate.org_id == DEFAULT_ORG_ID,
                (Candidate.phone_e164.is_not(None)) | (Candidate.email.is_not(None)),
            )
        )
    ).scalars().all()
    saved = [c for c in saved if c.id not in found_ids]
    if saved:
        await on_stage(f"Ranking {len(saved)} saved contacts…", 89)
        for candidate in saved:
            score, matched = rank_candidate(candidate_text=candidate_text_from_row(candidate), spec=spec)
            ranked.append((candidate, score, matched))
    contacts_found += len(saved)

    await on_stage("Ranking against the job description…", 92)
    await _persist_ranking(db, search.id, ranked)
    await on_stage("Saving results…", 97)

    search.status = "complete"
    search.credits_spent = len(rows)
    await db.flush()

    return len(rows), contacts_found


def candidate_text_from_row(candidate: Candidate) -> str:
    """Rankable text for a stored candidate (seed/manual rows keep their
    free text in raw_profile.about; provider rows keep the whole payload)."""
    raw = candidate.raw_profile or {}
    return " ".join(
        str(part)
        for part in (
            candidate.full_name, candidate.headline, candidate.current_title,
            candidate.current_company, raw.get("about"), raw.get("summary"),
        )
        if part
    )


async def _persist_ranking(
    db: AsyncSession, search_id: uuid.UUID, ranked: list[tuple[Candidate, float, list[str]]]
) -> None:
    ranked.sort(key=lambda item: item[1], reverse=True)
    for position, (candidate, score, matched) in enumerate(ranked, start=1):
        payload = {
            "match_score": round(score * 100, 2),
            "score_breakdown": {"matched_keywords": matched},
            "rank": position,
        }
        stmt = (
            pg_insert(SearchResult)
            .values(search_id=search_id, candidate_id=candidate.id, **payload)
            .on_conflict_do_update(constraint="pk_search_results", set_=payload)
        )
        await db.execute(stmt)


async def add_candidate_to_search(
    db: AsyncSession, search_id: uuid.UUID, request: AddCandidateRequestDTO
) -> RankedCandidateDTO:
    """Manual add: create the person, rank them against this search's JD,
    and re-number the search's ranks so they slot in where their score
    lands rather than being pinned to the bottom."""
    search = await db.get(Search, search_id)
    if search is None:
        raise SearchNotFoundError
    spec = ParseJdResponseDTO.model_validate(search.spec)

    full_name = request.full_name.strip()
    # Dedup key for people without a LinkedIn URL: same name at the same
    # company is the same person. Re-adding updates their details in place
    # instead of creating a second saved contact that would then be ranked
    # into every future search twice.
    name_company_key = f"{full_name.lower()}|{(request.company or '').strip().lower()}"
    candidate = (
        await db.execute(
            select(Candidate).where(
                Candidate.org_id == DEFAULT_ORG_ID, Candidate.name_company_key == name_company_key
            )
        )
    ).scalars().first()

    if candidate is None:
        candidate = Candidate(
            org_id=DEFAULT_ORG_ID,
            full_name=full_name,
            name_company_key=name_company_key,
            linkedin_slug=_slug_from_url(request.linkedin_url) or f"manual-{uuid.uuid4()}",
        )
        db.add(candidate)
    candidate.headline = " at ".join(p for p in (request.title, request.company) if p) or None
    candidate.current_title = request.title
    candidate.current_company = request.company
    candidate.location_text = request.location
    candidate.phone_e164 = request.phone
    candidate.email = request.email
    candidate.linkedin_url = request.linkedin_url
    candidate.raw_profile = {"manual": True, "about": request.about or ""}
    candidate.updated_at = func.now()
    await db.flush()

    existing = (
        await db.execute(
            select(SearchResult, Candidate)
            .join(Candidate, Candidate.id == SearchResult.candidate_id)
            .where(SearchResult.search_id == search_id)
        )
    ).all()
    ranked = [
        (c, float(sr.match_score) / 100, (sr.score_breakdown or {}).get("matched_keywords", []))
        for sr, c in existing
    ]
    score, matched = rank_candidate(candidate_text=candidate_text_from_row(candidate), spec=spec)
    ranked.append((candidate, score, matched))
    await _persist_ranking(db, search_id, ranked)

    position = next(i for i, (c, _, _) in enumerate(ranked, start=1) if c.id == candidate.id)
    return _to_ranked_dto(candidate, score, matched, position)


def _source_of(candidate: Candidate) -> str:
    raw = candidate.raw_profile or {}
    if raw.get("seed"):
        return "seed"
    if raw.get("manual"):
        return "manual"
    return "apify"


def _to_ranked_dto(candidate: Candidate, score: float, matched: list[str], rank: int) -> RankedCandidateDTO:
    return RankedCandidateDTO(
        candidate_id=str(candidate.id),
        name=candidate.full_name,
        title=candidate.current_title or "",
        company=candidate.current_company or "",
        location=candidate.location_text or "",
        phone=candidate.phone_e164,
        email=candidate.email,
        linkedin_url=candidate.linkedin_url,
        match_score=score,
        matched_keywords=matched,
        rank=rank,
        source=_source_of(candidate),
    )


async def get_search_results(db: AsyncSession, search_id: uuid.UUID) -> tuple[Search, list[RankedCandidateDTO]]:
    search = await db.get(Search, search_id)
    if search is None:
        raise SearchNotFoundError

    stmt = (
        select(SearchResult, Candidate)
        .join(Candidate, Candidate.id == SearchResult.candidate_id)
        .where(SearchResult.search_id == search_id)
        .order_by(SearchResult.rank)
    )
    result = await db.execute(stmt)

    rows = [
        _to_ranked_dto(
            candidate,
            float(search_result.match_score) / 100,
            (search_result.score_breakdown or {}).get("matched_keywords", []),
            search_result.rank or 0,
        )
        for search_result, candidate in result.all()
    ]
    return search, rows

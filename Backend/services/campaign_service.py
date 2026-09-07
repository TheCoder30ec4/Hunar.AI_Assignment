"""Creates a campaign from a completed search's ranked results, and serves
campaign + candidate data for the dashboard. No dialer exists yet — every
candidate starts (and stays) in stage='queued' until a calling pipeline is
built; called/connected/qualified counts are always 0 for now, not faked.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from dtos.campaign_dto import CampaignCandidateDTO, CampaignDetailDTO, CampaignDTO
from models.campaigns import Campaign, CampaignCandidate
from models.candidates import Candidate, SearchResult
from models.search import Search, SearchProviderRun
from services.enrich_service import get_last_known_credits_remaining
from services.search_run_service import _source_of


class SearchNotFoundError(Exception):
    pass


class SearchNotCompleteError(Exception):
    """Can't campaign a search that hasn't finished running."""


class CampaignNotFoundError(Exception):
    pass


async def create_campaign_from_search(
    db: AsyncSession, search_id: uuid.UUID, candidate_ids: list[uuid.UUID], name: str | None
) -> Campaign:
    """The recruiter's picks become campaign rows, after the clean check:
    anyone with a phone or email is queued for calling; anyone without is
    kept as stage='excluded' / reason 'no_contact' so the campaign shows who
    was dropped and why instead of silently shrinking the list. One bulk
    insert — this call sits between "Add to campaign" and the redirect."""
    search = await db.get(Search, search_id)
    if search is None:
        raise SearchNotFoundError
    if search.status != "complete":
        raise SearchNotCompleteError

    picked = (
        await db.execute(
            select(Candidate).where(Candidate.id.in_(candidate_ids), Candidate.org_id == search.org_id)
        )
    ).scalars().all()

    campaign = Campaign(org_id=search.org_id, search_id=search.id, name=name or search.title, status="ready")
    db.add(campaign)
    await db.flush()

    db.add_all(
        CampaignCandidate(
            campaign_id=campaign.id,
            candidate_id=candidate.id,
            stage="queued" if (candidate.phone_e164 or candidate.email) else "excluded",
            exclusion_reason=None if (candidate.phone_e164 or candidate.email) else "no_contact",
        )
        for candidate in picked
    )
    await db.flush()
    return campaign


def _to_campaign_dto(campaign: Campaign, callable_count: int, excluded_count: int) -> CampaignDTO:
    return CampaignDTO(
        id=str(campaign.id),
        name=campaign.name,
        status=campaign.status,
        created_at=campaign.created_at,
        candidate_count=callable_count,
        called_count=0,  # no dialer yet — see module docstring
        connected_count=0,
        qualified_count=0,
        credits_spent=0,
        excluded_count=excluded_count,
    )


async def list_campaigns(db: AsyncSession) -> list[CampaignDTO]:
    # One grouped query for every campaign's counts, not one query per row.
    counts_stmt = (
        select(
            CampaignCandidate.campaign_id,
            func.count().filter(CampaignCandidate.stage != "excluded"),
            func.count().filter(CampaignCandidate.stage == "excluded"),
        ).group_by(CampaignCandidate.campaign_id)
    )
    counts = {cid: (ok, ex) for cid, ok, ex in (await db.execute(counts_stmt)).all()}
    campaigns = (await db.execute(select(Campaign).order_by(Campaign.created_at.desc()))).scalars().all()
    return [_to_campaign_dto(c, *counts.get(c.id, (0, 0))) for c in campaigns]


async def get_campaign_detail(db: AsyncSession, campaign_id: uuid.UUID) -> CampaignDetailDTO:
    campaign = await db.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFoundError

    stmt = (
        select(CampaignCandidate, Candidate, SearchResult)
        .join(Candidate, Candidate.id == CampaignCandidate.candidate_id)
        .outerjoin(
            SearchResult,
            (SearchResult.candidate_id == CampaignCandidate.candidate_id)
            & (SearchResult.search_id == campaign.search_id),
        )
        .where(CampaignCandidate.campaign_id == campaign_id)
        .order_by(SearchResult.rank)
    )
    rows = (await db.execute(stmt)).all()

    candidates = [
        CampaignCandidateDTO(
            candidate_id=str(candidate.id),
            name=candidate.full_name,
            title=candidate.current_title or "",
            company=candidate.current_company or "",
            location=candidate.location_text or "",
            phone=candidate.phone_e164,
            email=candidate.email,
            linkedin_url=candidate.linkedin_url,
            match_score=float(search_result.match_score) / 100 if search_result else 0.0,
            matched_keywords=(search_result.score_breakdown or {}).get("matched_keywords", [])
            if search_result
            else [],
            rank=search_result.rank or 0 if search_result else 0,
            stage=campaign_candidate.stage,
            exclusion_reason=campaign_candidate.exclusion_reason,
            source=_source_of(candidate),
        )
        for campaign_candidate, candidate, search_result in rows
    ]

    excluded = sum(1 for c in candidates if c.stage == "excluded")
    base = _to_campaign_dto(campaign, len(candidates) - excluded, excluded)
    return CampaignDetailDTO(
        **base.model_dump(by_alias=False), candidates=candidates, contact_note=await _contact_note(db, campaign)
    )


_APOLLO_NOTES = {
    "API_INACCESSIBLE": "Phone numbers unavailable: Apollo.io returned 403 (people enrichment isn't in "
    "the account's Free plan), and Enrich.so's phone lookup costs 500 credits per person "
    "against a {balance}-credit balance. Emails come from Enrich.so's Email Finder where the "
    "employer's domain could be resolved.",
    "NOT_CONFIGURED": "Phone numbers unavailable: no Apollo.io API key is configured, and Enrich.so's "
    "phone lookup costs 500 credits per person against a {balance}-credit balance.",
}


async def _contact_note(db: AsyncSession, campaign: Campaign) -> str | None:
    if campaign.search_id is None:
        return None
    run = (
        await db.execute(
            select(SearchProviderRun).where(
                SearchProviderRun.search_id == campaign.search_id, SearchProviderRun.provider == "apollo"
            )
        )
    ).scalar_one_or_none()
    if run is None or run.status != "failed" or not run.error:
        return None
    template = _APOLLO_NOTES.get(run.error.get("code", ""), "Contacts unavailable: Apollo.io enrichment failed.")
    return template.format(balance=get_last_known_credits_remaining())

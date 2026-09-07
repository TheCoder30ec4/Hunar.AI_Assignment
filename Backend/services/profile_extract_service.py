"""Pulls current title / company / location out of the free-text Apify gives
us. The public-mode actor never fills jobTitle/currentCompany/location
(confirmed live: always null) — the facts are there, but buried in the
LinkedIn headline (`summary`) and the `about` blurb ("Data scientist at IBM
· Location: Bengaluru · ..."). One Groq call per batch of profiles, not one
per profile: 25 profiles is one ~2s request instead of 25.
"""

from __future__ import annotations

import json
import logging

from anyio import to_thread
from pydantic import BaseModel, ValidationError

from services.JD_Parse_service import _MODEL

logger = logging.getLogger(__name__)


class ExtractedProfile(BaseModel):
    title: str | None = None
    company: str | None = None
    location: str | None = None
    # Best-guess primary web domain of the employer ("Tech Mahindra" ->
    # "techmahindra.com"). Feeds Enrich.so's Email Finder, which refunds a
    # miss — so a wrong guess costs nothing but one request.
    company_domain: str | None = None


_SYSTEM_PROMPT = """You extract structured facts from LinkedIn profile snippets.
For EACH profile, return the person's CURRENT job title, CURRENT employer, and location.
- title: the actual job title only (e.g. "Senior Data Scientist"), never the whole headline,
  never a list of skills, never degrees. Prefer the most recent role in the text.
- company: the current employer name only. null if not stated.
- location: city/region/country as written. null if not stated.
- company_domain: the employer's primary website domain, lowercase, no scheme or www
  (e.g. "Tech Mahindra" -> "techmahindra.com", "Tesco" -> "tesco.com", "IBM" -> "ibm.com").
  Use your knowledge of the company; null only if the company is unknown or absent.
Return ONLY a JSON array, same length and order as the input, each item
{"title": string|null, "company": string|null, "location": string|null, "company_domain": string|null}. No prose."""


def _call_model(payload: str) -> list[dict]:
    response = _MODEL.invoke(
        [{"role": "system", "content": _SYSTEM_PROMPT}, {"role": "user", "content": payload}]
    )
    content = response.content if isinstance(response.content, str) else str(response.content)
    # Tolerate a fenced ```json block — the model occasionally wraps output.
    content = content.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(content)


async def extract_profiles(rows: list[dict]) -> list[ExtractedProfile]:
    """Same length/order as `rows`. Any failure degrades to empty
    extractions for the whole batch rather than failing the search — a
    missing title is recoverable, a failed run isn't.
    """
    if not rows:
        return []

    snippets = [
        {
            "i": i,
            "name": r.get("name"),
            "headline": r.get("summary") or r.get("roleFromSummary"),
            "about": (r.get("about") or "")[:600],
        }
        for i, r in enumerate(rows)
    ]

    try:
        raw = await to_thread.run_sync(_call_model, json.dumps(snippets, ensure_ascii=False))
        parsed = [ExtractedProfile.model_validate(item) for item in raw]
        if len(parsed) != len(rows):
            raise ValueError(f"expected {len(rows)} items, got {len(parsed)}")
        return parsed
    except (ValueError, ValidationError, json.JSONDecodeError):
        logger.exception("profile extraction returned an unusable shape; falling back to empty")
        return [ExtractedProfile() for _ in rows]

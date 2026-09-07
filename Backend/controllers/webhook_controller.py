"""Inbound webhooks. Apollo posts phone-number reveals here asynchronously
(people/match with reveal_phone_number=true only queues the lookup) — see
services/apollo_service.py. Needs a public HTTPS URL in APOLLO_WEBHOOK_URL
to be reachable; locally it never fires.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from Database.core import get_db
from models.candidates import Candidate

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)


@router.post("/apollo", status_code=204)
async def apollo_phone_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> None:
    """Payload shape per Apollo's docs: {"people": [{"linkedin_url": ...,
    "phone_numbers": [{"sanitized_number": "+91..."}]}]}. Matched back to
    the candidate on linkedin_url; unknown URLs are ignored, not errors.
    """
    body = await request.json()
    for person in body.get("people") or []:
        phones = person.get("phone_numbers") or []
        number = phones[0].get("sanitized_number") if phones else None
        url = person.get("linkedin_url")
        if not (number and url):
            continue
        await db.execute(update(Candidate).where(Candidate.linkedin_url == url).values(phone_e164=number))
    logger.info("apollo webhook processed %d people", len(body.get("people") or []))

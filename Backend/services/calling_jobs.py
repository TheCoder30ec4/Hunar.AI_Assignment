"""Keeps bulk-calling runs alive independently of any HTTP connection.

A calling run outlives the request that started it: calls take minutes, and
if the recruiter closes the tab mid-run the calls are still happening — the
poller MUST keep writing results to Postgres regardless. So the pipeline
runs as a background asyncio task owning its own DB session, and SSE clients
subscribe to a broadcast of its events rather than driving it.

Reconnecting mid-run replays the events already emitted, so a refreshed page
catches up instead of showing an empty stream.

In-process only: a second uvicorn worker wouldn't see these jobs. Fine for a
single-worker deployment; a multi-worker one needs Redis pub/sub here, which
is a swap of this module's internals, not of its callers.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from Database.core import get_session_factory
from services.calling_service import (
    CallingFailedError,
    CampaignNotFoundError,
    NoCallableCandidatesError,
    run_bulk_calling,
)

logger = logging.getLogger(__name__)


class CallingJob:
    def __init__(self, campaign_id: uuid.UUID) -> None:
        self.campaign_id = campaign_id
        self.events: list[dict[str, Any]] = []
        self.done = False
        self._subscribers: list[asyncio.Queue[dict[str, Any] | None]] = []

    async def emit(self, kind: str, data: dict[str, Any]) -> None:
        event = {"type": kind, **data}
        self.events.append(event)
        for queue in self._subscribers:
            queue.put_nowait(event)

    def finish(self) -> None:
        self.done = True
        for queue in self._subscribers:
            queue.put_nowait(None)

    async def subscribe(self) -> AsyncIterator[dict[str, Any]]:
        """Replays everything so far, then follows live events."""
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
        for event in self.events:
            queue.put_nowait(event)
        if self.done:
            queue.put_nowait(None)
        self._subscribers.append(queue)
        try:
            while True:
                event = await queue.get()
                if event is None:
                    return
                yield event
        finally:
            self._subscribers.remove(queue)


_JOBS: dict[uuid.UUID, CallingJob] = {}


def get_job(campaign_id: uuid.UUID) -> CallingJob | None:
    return _JOBS.get(campaign_id)


def start_job(campaign_id: uuid.UUID, candidate_ids: list[uuid.UUID]) -> CallingJob:
    """Idempotent: an already-running campaign returns its existing job
    rather than dialing everyone a second time."""
    existing = _JOBS.get(campaign_id)
    if existing is not None and not existing.done:
        return existing

    job = CallingJob(campaign_id)
    _JOBS[campaign_id] = job

    async def run() -> None:
        async with get_session_factory()() as db:
            try:
                await run_bulk_calling(db, campaign_id, candidate_ids or None, job.emit)
            except CampaignNotFoundError:
                await job.emit("error", {"message": "Campaign not found."})
            except NoCallableCandidatesError:
                await job.emit(
                    "error", {"message": "None of the selected candidates have a phone number."}
                )
            except CallingFailedError as exc:
                await job.emit(
                    "error", {"message": f"The calling provider rejected the batch: {exc}"}
                )
            except Exception:
                logger.exception("bulk calling job crashed for %s", campaign_id)
                await db.rollback()
                await job.emit("error", {"message": "Calling failed unexpectedly."})
            finally:
                job.finish()

    # Held on the job so the task isn't garbage-collected mid-run.
    job.task = asyncio.create_task(run())  # type: ignore[attr-defined]
    return job

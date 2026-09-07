"""Hunar Voice API config. Every value below was confirmed against the live
OpenAPI spec (https://api.voice.hunar.ai/docs/external/openapi.json) and a
real completed call on 2026-09-07 — not copied from prose docs.

The API exposes no transcript: GET /calls/{id} returns recording_url +
result (the agent's extracted answers) only. Transcripts are produced here
by running the recording through Groq Whisper — see transcription_service.py.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

HUNAR_BASE_URL = "https://api.voice.hunar.ai/external/v1"

# Max recipients accepted in one POST /calls/bulk/ request. The API documents
# no explicit ceiling; this is our own batching size so one oversized request
# can't fail wholesale.
BULK_BATCH_SIZE = 50

# How often the poller re-reads in-flight calls from Hunar. Calls take
# ~40s-3min, so this is frequent enough to feel live without hammering the API.
POLL_INTERVAL_SECONDS = 4.0
# Hard ceiling on one campaign's polling loop, so a stuck call can never leave
# an SSE connection (and its DB session) open forever.
POLL_TIMEOUT_SECONDS = 1800

# Terminal Hunar CallStatus values — polling stops when every call reaches one.
TERMINAL_CALL_STATUSES = frozenset({"COMPLETED", "NOT_CONNECTED", "CANCELLED", "FAILED"})

# Hunar CallStatus -> call_attempts.status (ck_call_attempts_status).
# Hunar's own enum, confirmed from the spec:
#   NOT_STARTED, SCHEDULED, INITIATED, RINGING, IN_PROGRESS,
#   COMPLETED, NOT_CONNECTED, CANCELLED, FAILED
CALL_STATUS_MAP = {
    "NOT_STARTED": "queued",
    "SCHEDULED": "queued",
    "INITIATED": "dialing",
    "RINGING": "ringing",
    "IN_PROGRESS": "in_progress",
    "COMPLETED": "completed",
    "NOT_CONNECTED": "no_answer",
    "CANCELLED": "failed",
    "FAILED": "failed",
}

# campaign_candidates.stage (ck_campaign_candidates_stage) for a finished call.
# 'qualified'/'not_a_fit' come from the agent's own recommendation field.
RECOMMENDATION_STAGE_MAP = {
    "hire_now": "qualified",
    "maybe": "interested",
    "reject": "not_a_fit",
}


class CallingSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    hunar_ai_api_key: str
    hunar_agent_id: str
    groq_api_key: str


@lru_cache
def get_calling_settings() -> CallingSettings:
    return CallingSettings()  # type: ignore[call-arg]

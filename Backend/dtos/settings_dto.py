"""Request/response contracts for per-campaign calling settings and the
suppression list. camelCase on the wire, matching campaign_dto.py.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CampaignSettingsDTO(BaseModel):
    """Per-campaign calling configuration. Every field maps to a real column
    on `campaigns` and a real parameter the voice API accepts per call —
    nothing here is decorative.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    # Extra instructions appended to the shared agent prompt for this
    # campaign only (core/agent_prompt.py holds the base script).
    script_template: str | None = None
    calling_window_start: str = Field(default="08:00", pattern=r"^\d{2}:\d{2}$")
    calling_window_end: str = Field(default="21:00", pattern=r"^\d{2}:\d{2}$")
    timezone: str = "Asia/Kolkata"
    max_attempts: int = Field(default=3, ge=1, le=10)
    allowed_days: list[str] = Field(
        default_factory=lambda: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    )
    retry_interval_hours: int = Field(default=4, ge=0, le=168)


class SuppressionEntryDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    identifier_type: str
    # The raw identifier is NEVER stored (see core/identifier_hash.py), so
    # only a short hash prefix can be shown — enough to tell rows apart.
    identifier_preview: str
    reason: str
    source: str | None
    created_at: datetime


class AddSuppressionRequestDTO(BaseModel):
    identifier_type: str = Field(pattern=r"^(phone|email|linkedin)$")
    identifier: str = Field(min_length=1)
    reason: str = Field(default="manual", pattern=r"^(dnc_registry|opt_out|manual|bounce)$")
    source: str | None = None

"""A campaign is a search's candidates plus the calling script and dialing
policy applied against them.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column

from Database.core import Base


class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'review', 'ready', 'calling', 'paused', 'complete')",
            name="ck_campaigns_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    search_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("searches.id"))
    name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")
    script_template: Mapped[str | None] = mapped_column(Text)
    voice_config: Mapped[dict | None] = mapped_column(JSONB)
    calling_window_start: Mapped[time | None] = mapped_column(Time)
    calling_window_end: Mapped[time | None] = mapped_column(Time)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, server_default="Asia/Kolkata")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="3")
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class CampaignQuestion(Base):
    """The approved question set a campaign asks. position drives display
    order and is reorderable within one transaction — see the deferred
    unique constraint below.
    """

    __tablename__ = "campaign_questions"
    __table_args__ = (
        CheckConstraint(
            "answer_type IN ('enum', 'number', 'duration', 'money', 'bool', 'text')",
            name="ck_campaign_questions_answer_type",
        ),
        UniqueConstraint("campaign_id", "key", name="uq_campaign_questions_campaign_key"),
        # Deferred: reordering positions via sequential UPDATEs in one
        # transaction would otherwise transiently collide on this constraint
        # the instant two rows momentarily share a position value.
        UniqueConstraint(
            "campaign_id",
            "position",
            name="uq_campaign_questions_campaign_position",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    answer_type: Mapped[str] = mapped_column(Text, nullable=False)
    answer_config: Mapped[dict | None] = mapped_column(JSONB)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")


class CampaignCandidate(Base):
    """The working row per person in a campaign — the dialer polls this."""

    __tablename__ = "campaign_candidates"
    __table_args__ = (
        CheckConstraint(
            "stage IN ('queued', 'excluded', 'dialing', 'connected', 'qualified', "
            "'not_a_fit', 'interested', 'scheduled', 'unreachable', 'opted_out')",
            name="ck_campaign_candidates_stage",
        ),
        CheckConstraint(
            "exclusion_reason IN ('dnc', 'opted_out', 'region_email_first', 'no_contact')",
            name="ck_campaign_candidates_exclusion_reason",
        ),
        CheckConstraint(
            "interest_level IN ('high', 'medium', 'low')",
            name="ck_campaign_candidates_interest_level",
        ),
        Index("ix_campaign_candidates_campaign_stage", "campaign_id", "stage"),
        # The dialer's poll query: "who's due to be called next". Indexing
        # only queued rows keeps this index small regardless of how large the
        # campaign's terminal-stage history grows.
        Index(
            "ix_campaign_candidates_next_attempt_queued",
            "next_attempt_at",
            postgresql_where=text("stage = 'queued'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("candidates.id"), nullable=False)
    stage: Mapped[str] = mapped_column(Text, nullable=False, server_default="queued")
    exclusion_reason: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    next_attempt_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    interest_level: Mapped[str | None] = mapped_column(Text)
    disposition_reason: Mapped[str | None] = mapped_column(Text)

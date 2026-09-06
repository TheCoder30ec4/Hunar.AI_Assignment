"""One call_attempt per dial. call_events is the raw webhook log feeding it;
call_answers is what the voice agent actually extracted, normalised.

call_events is append-only by convention: no service-layer code path may
UPDATE or DELETE a row here. It's the only record of what a provider actually
sent, in the order it arrived — the source of truth for debugging a bad
funnel number or reconciling a provider invoice dispute. Enforcing this at
the DB level (REVOKE UPDATE, DELETE) needs a second least-privilege Postgres
role, which doesn't exist yet — today the app connects as a single role that
also needs full access to every other table. Follow-up once that role split
exists.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column

from Database.core import Base

_ACTIVE_CALL_STATUSES = "('queued', 'dialing', 'ringing', 'in_progress')"


class CallAttempt(Base):
    __tablename__ = "call_attempts"
    __table_args__ = (
        CheckConstraint(
            "channel IN ('voice', 'whatsapp', 'sms', 'ivr')", name="ck_call_attempts_channel"
        ),
        CheckConstraint(
            "status IN ('queued', 'dialing', 'ringing', 'in_progress', 'completed', "
            "'no_answer', 'busy', 'failed', 'rejected')",
            name="ck_call_attempts_status",
        ),
        UniqueConstraint(
            "campaign_candidate_id", "attempt_no", name="uq_call_attempts_candidate_attempt_no"
        ),
        # Sized to the working set only: calls actively in flight, not the
        # full history of completed/failed attempts.
        Index(
            "ix_call_attempts_active_status",
            "status",
            postgresql_where=text(f"status IN {_ACTIVE_CALL_STATUSES}"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    campaign_candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaign_candidates.id", ondelete="CASCADE"), nullable=False
    )
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False, server_default="hunar")
    provider_call_id: Mapped[str | None] = mapped_column(Text, unique=True)
    channel: Mapped[str] = mapped_column(Text, nullable=False, server_default="voice")
    to_number_e164: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="queued")
    # Mirrors call_events.seq for the last event actually applied to this row —
    # lets a webhook handler discard a duplicate/out-of-order delivery in one
    # comparison instead of re-deriving state from the full event log.
    last_event_seq: Mapped[int | None] = mapped_column(BigInteger)
    duration_secs: Mapped[int | None] = mapped_column(Integer)
    recording_s3_key: Mapped[str | None] = mapped_column(Text)
    transcript_s3_key: Mapped[str | None] = mapped_column(Text)
    cost_micros: Mapped[int | None] = mapped_column(BigInteger)
    consent_recorded: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class CallEvent(Base):
    """Raw webhook log. Append-only — see module docstring."""

    __tablename__ = "call_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    # Nullable: a webhook can arrive before the attempt row is matched
    # (e.g. provider fires before our own insert commits).
    call_attempt_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("call_attempts.id"))
    provider_event_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class CallAnswer(Base):
    """One normalised answer per question per call.

    Exactly one value_* column is set — num_nonnulls() is Postgres's built-in
    "how many of these N args are non-null" function, purpose-built for this
    check and clearer than hand-rolled CASE arithmetic.
    """

    __tablename__ = "call_answers"
    __table_args__ = (
        UniqueConstraint(
            "call_attempt_id", "question_key", name="uq_call_answers_attempt_question"
        ),
        CheckConstraint(
            "num_nonnulls(value_text, value_number, value_bool, value_duration_days) = 1",
            name="ck_call_answers_exactly_one_value",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    call_attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("call_attempts.id", ondelete="CASCADE"), nullable=False
    )
    question_key: Mapped[str] = mapped_column(Text, nullable=False)
    raw_text: Mapped[str | None] = mapped_column(Text)
    value_text: Mapped[str | None] = mapped_column(Text)
    value_number: Mapped[Decimal | None] = mapped_column(Numeric)
    value_bool: Mapped[bool | None] = mapped_column(Boolean)
    value_duration_days: Mapped[int | None] = mapped_column(Integer)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(3, 2))
    transcript_offset_ms: Mapped[int | None] = mapped_column(Integer)
    edited_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    edited_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class CallTranscriptSegment(Base):
    """Optional: only needed if in-app transcript search is built."""

    __tablename__ = "call_transcript_segments"
    __table_args__ = (
        CheckConstraint(
            "speaker IN ('agent', 'candidate')", name="ck_call_transcript_segments_speaker"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    call_attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("call_attempts.id", ondelete="CASCADE"), nullable=False
    )
    speaker: Mapped[str] = mapped_column(Text, nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

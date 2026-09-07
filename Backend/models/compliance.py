"""Suppression, the checks run against it, and consent evidence. Checked
before every dial — see CampaignCandidate.stage / exclusion_reason in
campaigns.py for how a suppression hit actually blocks a call.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column

from Database.core import Base


class SuppressionList(Base):
    """Non-bypassable: identifiers here must never be dialed, emailed, or
    messaged regardless of any other campaign state.
    """

    __tablename__ = "suppression_list"
    __table_args__ = (
        CheckConstraint(
            "identifier_type IN ('phone', 'email', 'linkedin')",
            name="ck_suppression_list_identifier_type",
        ),
        CheckConstraint(
            "reason IN ('dnc_registry', 'opt_out', 'manual', 'bounce')",
            name="ck_suppression_list_reason",
        ),
        UniqueConstraint(
            "org_id", "identifier_type", "identifier_hash",
            name="uq_suppression_list_org_type_hash",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    identifier_type: Mapped[str] = mapped_column(Text, nullable=False)
    # Stored hashed, never raw — the hashing algorithm/salt strategy is a
    # service-layer decision (out of scope here); this column only holds the
    # already-hashed value.
    identifier_hash: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str | None] = mapped_column(Text)
    added_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class ComplianceCheck(Base):
    """Proof of what was checked and when, per campaign candidate — the audit
    trail behind the compliance review gate.
    """

    __tablename__ = "compliance_checks"
    __table_args__ = (
        CheckConstraint(
            "check_type IN ('dnc', 'opt_out', 'region', 'calling_window')",
            name="ck_compliance_checks_check_type",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    campaign_candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaign_candidates.id", ondelete="CASCADE"), nullable=False
    )
    check_type: Mapped[str] = mapped_column(Text, nullable=False)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    detail: Mapped[dict | None] = mapped_column(JSONB)
    checked_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class ConsentRecord(Base):
    __tablename__ = "consent_records"
    __table_args__ = (
        CheckConstraint(
            "basis IN ('legitimate_interest', 'consent')", name="ck_consent_records_basis"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    basis: Mapped[str] = mapped_column(Text, nullable=False)
    channel: Mapped[str | None] = mapped_column(Text)
    evidence_s3_key: Mapped[str | None] = mapped_column(Text)
    granted_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

"""credit_ledger and audit_log are both append-only by convention: no
service-layer code path may UPDATE or DELETE a row here. credit_ledger is
what reconciles against provider invoices when a credit balance looks wrong;
audit_log is the record of who did what. Enforcing this at the DB level
(REVOKE UPDATE, DELETE) needs a second least-privilege Postgres role, which
doesn't exist yet — see the same note in calls.py.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column

from Database.core import Base


class CreditLedger(Base):
    __tablename__ = "credit_ledger"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    search_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("searches.id"))
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"))
    provider: Mapped[str | None] = mapped_column(Text)
    delta_credits: Mapped[int] = mapped_column(Integer, nullable=False)  # negative = spend
    unit_cost_micros: Mapped[int | None] = mapped_column(BigInteger)
    reference: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    before: Mapped[dict | None] = mapped_column(JSONB)
    after: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class WebhookIdempotency(Base):
    """DynamoDB in production; a plain table for local/dev. Every inbound
    webhook checks provider_event_id here before processing, so a redelivered
    event is a cheap no-op instead of double-applying a side effect.
    """

    __tablename__ = "webhook_idempotency"

    provider_event_id: Mapped[str] = mapped_column(Text, primary_key=True)
    processed_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)

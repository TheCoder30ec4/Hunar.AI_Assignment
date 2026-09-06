"""A search: a parsed job description, the provider queries it fans out into,
and the budget guardrails around both.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import Mapped, mapped_column

from Database.core import Base


class Search(Base):
    __tablename__ = "searches"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'running', 'complete', 'failed', 'cancelled')",
            name="ck_searches_status",
        ),
        CheckConstraint("credits_spent <= credits_budget", name="ck_searches_credits_within_budget"),
        Index("ix_searches_org_created", "org_id", text("created_at DESC")),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    jd_text: Mapped[str] = mapped_column(Text, nullable=False)
    # 1536 dims matches OpenAI text-embedding-3-small / ada-002. Nullable until
    # the embedding pipeline runs.
    jd_embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    spec: Mapped[dict] = mapped_column(JSONB, nullable=False)
    spec_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")
    credits_budget: Mapped[int] = mapped_column(Integer, nullable=False)
    credits_spent: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class SearchProviderRun(Base):
    """Cost audit trail: one row per provider fan-out per search."""

    __tablename__ = "search_provider_runs"
    __table_args__ = (
        CheckConstraint(
            "provider IN ('pdl', 'apollo', 'proxycurl', 'coresignal')",
            name="ck_search_provider_runs_provider",
        ),
        CheckConstraint(
            "status IN ('queued', 'running', 'complete', 'failed', 'rate_limited')",
            name="ck_search_provider_runs_status",
        ),
        UniqueConstraint("search_id", "provider", name="uq_search_provider_runs_search_provider"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    search_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("searches.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="queued")
    records_returned: Mapped[int | None] = mapped_column(Integer)
    credits_spent: Mapped[int | None] = mapped_column(Integer)
    # Stored so a failed/rate-limited run can be replayed without re-deriving
    # the request from the search spec.
    request_payload: Mapped[dict | None] = mapped_column(JSONB)
    error: Mapped[dict | None] = mapped_column(JSONB)
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

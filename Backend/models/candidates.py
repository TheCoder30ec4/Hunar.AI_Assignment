"""Candidates are global per org, not per search — the same person surfaced by
two different searches is one row, re-ranked per search via search_results.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pgvector.sqlalchemy import Vector
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


class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint("org_id", "linkedin_slug", name="uq_candidates_org_linkedin_slug"),
        UniqueConstraint("org_id", "email_hash", name="uq_candidates_org_email_hash"),
        # Fuzzy-name search fallback when linkedin_slug/email_hash don't match
        # (e.g. a provider returned only a name + company).
        Index(
            "ix_candidates_full_name_trgm",
            "full_name",
            postgresql_using="gin",
            postgresql_ops={"full_name": "gin_trgm_ops"},
        ),
        # IVFFlat is a clustering index: quality depends on data present at
        # build time. lists=100 is the pgvector-recommended floor for small/
        # unknown row counts — rebuild (REINDEX) once real candidate volume
        # exists so clusters reflect the actual embedding distribution.
        Index(
            "ix_candidates_profile_embedding_ivfflat",
            "profile_embedding",
            postgresql_using="ivfflat",
            postgresql_ops={"profile_embedding": "vector_cosine_ops"},
            postgresql_with={"lists": 100},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orgs.id"), nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    headline: Mapped[str | None] = mapped_column(Text)
    current_title: Mapped[str | None] = mapped_column(Text)
    current_company: Mapped[str | None] = mapped_column(Text)
    location_text: Mapped[str | None] = mapped_column(Text)
    country_code: Mapped[str | None] = mapped_column(Text)  # char(2), enforced at insert
    linkedin_url: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    phone_e164: Mapped[str | None] = mapped_column(Text)
    linkedin_slug: Mapped[str | None] = mapped_column(Text)
    email_hash: Mapped[str | None] = mapped_column(Text)
    name_company_key: Mapped[str | None] = mapped_column(Text)
    profile_embedding: Mapped[list[float] | None] = mapped_column(Vector(1536))
    raw_profile: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class CandidateFieldSource(Base):
    """Per-field provenance: which provider said what, and how confidently.

    Deliberately separate from Candidate — the parent row holds the merged
    value the app uses; this table holds who said what, powering the results
    UI's per-field source attribution. Collapsing this into a JSONB column on
    Candidate would make that UI unbuildable without parsing JSON per render.
    """

    __tablename__ = "candidate_field_sources"
    __table_args__ = (
        UniqueConstraint(
            "candidate_id", "field_name", "provider", name="uq_candidate_field_sources_field_provider"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    field_name: Mapped[str] = mapped_column(Text, nullable=False)
    field_value: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(3, 2), nullable=False)
    # observed_at: the provider's own freshness timestamp for this field.
    # fetched_at: when we pulled it. They diverge for cached/stale provider data.
    observed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    fetched_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )


class CandidateProviderRecord(Base):
    """Raw payload cache per provider, keyed on the provider's own id.

    Exists so re-viewing a candidate never re-spends a credit against the
    provider — check here first, fall through to a live fetch only past
    expires_at.
    """

    __tablename__ = "candidate_provider_records"
    __table_args__ = (
        UniqueConstraint("provider", "provider_id", name="uq_candidate_provider_records_provider_id"),
        Index("ix_candidate_provider_records_expires_at", "expires_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    provider_id: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))


class SearchResult(Base):
    """Join table: how one candidate ranked within one search.

    A composite PK, not a surrogate id — (search_id, candidate_id) is already
    the natural key and a search never ranks the same candidate twice.
    """

    __tablename__ = "search_results"
    __table_args__ = (
        Index("ix_search_results_search_score", "search_id", text("match_score DESC")),
    )

    search_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("searches.id", ondelete="CASCADE"), primary_key=True
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("candidates.id", ondelete="CASCADE"), primary_key=True
    )
    match_score: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    score_breakdown: Mapped[dict | None] = mapped_column(JSONB)
    rank: Mapped[int | None] = mapped_column(Integer)

"""Database connection layer: engine, session factory, and the FastAPI dependency.

One module owns the engine lifecycle so it is created once at process startup
and disposed once at shutdown — never per-request.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import MetaData, text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Loaded once from environment / .env. See Backend/.env for local values."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    db_pool_size: int = 10
    db_max_overflow: int = 5
    # Fail fast on a wedged connection rather than hanging a request forever.
    db_pool_timeout: int = 30
    # Recycle before typical cloud-LB / pgbouncer idle-connection cutoffs.
    db_pool_recycle: int = 1800
    db_echo: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]  # populated from env/.env at runtime


# Without this, Alembic autogenerate produces random-suffixed constraint/index
# names (e.g. "orgs_pkey1") that are unreadable and change on regeneration.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Shared declarative base — every ORM model in the app inherits from this."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    """Create the engine on first use and reuse it for the life of the process.

    pool_pre_ping guards against the connection going stale under the app
    (e.g. Postgres restarted, or a cloud proxy dropped an idle connection) —
    without it the first query after such an event raises instead of
    transparently reconnecting.
    """
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            echo=settings.db_echo,
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout,
            pool_recycle=settings.db_pool_recycle,
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(
            bind=get_engine(),
            expire_on_commit=False,
            autoflush=False,
        )
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: `db: AsyncSession = Depends(get_db)`.

    One session per request. Commits only if the endpoint completed without
    raising; any exception rolls back so a half-finished unit of work never
    reaches the database. The session always closes, returning its
    connection to the pool.
    """
    session_factory = get_session_factory()
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def lifespan_db(app: object) -> AsyncGenerator[None, None]:
    """Wire into FastAPI's lifespan to verify connectivity at startup and
    dispose the pool cleanly at shutdown:

        app = FastAPI(lifespan=lifespan_db)

    FastAPI always calls a lifespan context manager as `lifespan(app)`, so
    this must accept (and can ignore) the app instance even though nothing
    here needs it.
    """
    del app  # unused — required by FastAPI's lifespan calling convention
    engine = get_engine()
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("database connection established")
    except Exception:
        logger.exception("database connectivity check failed at startup")
        raise

    yield

    await engine.dispose()
    logger.info("database engine disposed")

"""DATABASE_URL normalisation.

Managed hosts hand out a driver-less URL; create_async_engine needs an async
driver. Getting this wrong crashes at startup with an opaque error, so the
rewrite is pinned here.
"""

from Database.core import Settings


def test_render_style_url_gets_the_async_driver() -> None:
    settings = Settings(database_url="postgresql://u:p@host:5432/db")
    assert settings.database_url == "postgresql+asyncpg://u:p@host:5432/db"


def test_legacy_postgres_scheme_is_upgraded() -> None:
    """Some hosts still emit the deprecated `postgres://` scheme."""
    settings = Settings(database_url="postgres://u:p@host:5432/db")
    assert settings.database_url == "postgresql+asyncpg://u:p@host:5432/db"


def test_an_explicit_driver_is_left_alone() -> None:
    url = "postgresql+asyncpg://u:p@host:5432/db"
    assert Settings(database_url=url).database_url == url


def test_credentials_containing_the_scheme_are_not_mangled() -> None:
    """Only the leading scheme is rewritten — a password containing
    'postgresql://' must survive intact."""
    url = "postgresql://u:postgresql://x@host:5432/db"
    assert Settings(database_url=url).database_url == (
        "postgresql+asyncpg://u:postgresql://x@host:5432/db"
    )

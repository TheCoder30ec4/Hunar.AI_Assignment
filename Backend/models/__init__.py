"""Import every domain module so Base.metadata registers all tables.

Alembic's autogenerate diffs Base.metadata against the live database, and a
table is only visible there once its model class has been imported somewhere.
Centralizing that import here means env.py needs only `import models` — no
domain can be silently missed.
"""

from . import (
    calls,
    campaigns,
    candidates,
    compliance,
    ops,
    search,
    tenancy,
)

__all__ = [
    "calls",
    "campaigns",
    "candidates",
    "compliance",
    "ops",
    "search",
    "tenancy",
]

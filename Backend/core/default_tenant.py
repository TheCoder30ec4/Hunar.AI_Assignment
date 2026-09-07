"""There is no real multi-tenancy yet — auth is two fixed accounts with no DB
row (see auth_service.py) and no endpoint has ever written to orgs/users. The
search-run pipeline still needs a real org_id/created_by to satisfy the
schema's FKs, so it writes against one fixed seeded org/user rather than
inventing a login-to-org mapping that nothing else in the app has yet.
"""

from __future__ import annotations

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

DEFAULT_ORG_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEFAULT_USER_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")


async def ensure_default_tenant(db: AsyncSession) -> None:
    """Idempotent seed — safe to call on every request that needs it."""
    await db.execute(
        text(
            "INSERT INTO orgs (id, name) VALUES (:id, 'Default Org') "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {"id": DEFAULT_ORG_ID},
    )
    await db.execute(
        text(
            "INSERT INTO users (id, org_id, email, name, role) "
            "VALUES (:id, :org_id, 'default@hunar.ai', 'Default User', 'admin') "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {"id": DEFAULT_USER_ID, "org_id": DEFAULT_ORG_ID},
    )

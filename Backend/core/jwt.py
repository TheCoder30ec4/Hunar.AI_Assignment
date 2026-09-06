"""JWT encode/decode. One place owns the token shape so the auth service and
any future "who am I" dependency agree on what's inside a token.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from pydantic import BaseModel

from core.auth_config import get_auth_settings


class TokenPayload(BaseModel):
    sub: str  # email
    role: str
    exp: datetime


def create_access_token(*, email: str, role: str) -> str:
    settings = get_auth_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": email, "role": role, "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


class InvalidTokenError(Exception):
    """Raised for any expired/malformed/tampered token — the controller maps
    this to a 401, never leaking *why* decoding failed.
    """


def decode_access_token(token: str) -> TokenPayload:
    settings = get_auth_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise InvalidTokenError from exc
    return TokenPayload.model_validate(payload)

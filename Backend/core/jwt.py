"""JWT encode/decode for both token kinds. One place owns the token shape so
the auth service and any future "who am I" dependency agree on what's inside
a token.

Access and refresh tokens are signed with DIFFERENT secrets and carry a
`type` claim — decode_access_token rejects a refresh token presented as an
access token (and vice versa) even if someone tried the wrong secret by
mistake, so a leaked refresh token alone can't be replayed as an access
token without also matching its own type check.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from jose import JWTError, jwt
from pydantic import BaseModel

from core.auth_config import get_auth_settings


class TokenPayload(BaseModel):
    sub: str  # email
    role: str
    exp: datetime


class InvalidTokenError(Exception):
    """Raised for any expired/malformed/tampered/wrong-type token — the
    controller maps this to a 401, never leaking *why* decoding failed.
    """


def create_access_token(*, email: str, role: str) -> str:
    settings = get_auth_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expires_minutes)
    payload = {"sub": email, "role": role, "exp": expires_at, "type": "access"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(*, email: str, role: str) -> str:
    settings = get_auth_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_expires_days)
    payload = {"sub": email, "role": role, "exp": expires_at, "type": "refresh"}
    return jwt.encode(payload, settings.jwt_refresh_secret, algorithm=settings.jwt_algorithm)


def _decode(token: str, *, secret: str, expected_type: Literal["access", "refresh"]) -> TokenPayload:
    settings = get_auth_settings()
    try:
        payload = jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
    except JWTError as exc:
        raise InvalidTokenError from exc
    if payload.get("type") != expected_type:
        raise InvalidTokenError
    return TokenPayload.model_validate(payload)


def decode_access_token(token: str) -> TokenPayload:
    return _decode(token, secret=get_auth_settings().jwt_secret, expected_type="access")


def decode_refresh_token(token: str) -> TokenPayload:
    return _decode(token, secret=get_auth_settings().jwt_refresh_secret, expected_type="refresh")

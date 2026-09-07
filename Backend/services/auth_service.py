"""Login against the two fixed accounts in core.auth_config — no database
lookup, no signup. See that module's docstring for why.
"""

from __future__ import annotations

import bcrypt

from core.auth_config import ACCOUNTS
from core.jwt import InvalidTokenError, create_access_token, create_refresh_token, decode_refresh_token
from dtos.auth_dto import LoginRequestDTO, LoginResponseDTO, RefreshRequestDTO, RefreshResponseDTO


class InvalidCredentialsError(Exception):
    """Wrong email or wrong password — deliberately the same error for both,
    so a failed login never confirms whether an email exists.
    """


def login_service(request: LoginRequestDTO) -> LoginResponseDTO:
    account = ACCOUNTS.get(request.email)

    # Constant-shape check: run bcrypt against a dummy hash even when the
    # email doesn't exist, so a non-existent email doesn't return faster than
    # a wrong password and leak which emails are valid via timing.
    password_hash = (
        account["password_hash"]
        if account is not None
        else "$2b$12$Si0uJcSoGYRPLnWBJUrVLed6xmAfnufgA5gNceaQhIOArFM7rlApq"
    )
    password_matches = bcrypt.checkpw(request.password.encode("utf-8"), password_hash.encode("utf-8"))

    if account is None or not password_matches:
        raise InvalidCredentialsError

    return LoginResponseDTO(
        access_token=create_access_token(email=request.email, role=account["role"]),
        refresh_token=create_refresh_token(email=request.email, role=account["role"]),
        email=request.email,
        role=account["role"],
    )


def refresh_service(request: RefreshRequestDTO) -> RefreshResponseDTO:
    """Exchanges a refresh token for a new short-lived access token. Never
    issues a new refresh token here (no rotation) — the same refresh token
    keeps working until its own 30-day expiry, matching the stateless design
    (no DB to record rotation against).
    """
    try:
        payload = decode_refresh_token(request.refresh_token)
    except InvalidTokenError as exc:
        raise InvalidCredentialsError from exc

    # The account may have been removed from ACCOUNTS since the refresh
    # token was issued — re-check rather than trusting the token's own role
    # claim forever.
    account = ACCOUNTS.get(payload.sub)
    if account is None:
        raise InvalidCredentialsError

    return RefreshResponseDTO(access_token=create_access_token(email=payload.sub, role=account["role"]))

"""Login against the two fixed accounts in core.auth_config — no database
lookup, no signup. See that module's docstring for why.
"""

from __future__ import annotations

import bcrypt

from core.auth_config import ACCOUNTS
from core.jwt import create_access_token
from dtos.auth_dto import LoginRequestDTO, LoginResponseDTO


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

    access_token = create_access_token(email=request.email, role=account["role"])
    return LoginResponseDTO(
        access_token=access_token,
        email=request.email,
        role=account["role"],
    )

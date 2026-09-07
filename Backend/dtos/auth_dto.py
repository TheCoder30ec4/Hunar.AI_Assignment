"""Request/response contracts for the auth endpoints.

Kept separate from core.auth_config.ACCOUNTS and models/tenancy.py's User ORM
model on purpose: a DTO describes what crosses the HTTP boundary, not what's
stored — the response never includes a password_hash even though the account
record has one.
"""

from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class LoginRequestDTO(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class LoginResponseDTO(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    email: str
    role: str


class RefreshRequestDTO(BaseModel):
    refresh_token: str = Field(min_length=1)


class RefreshResponseDTO(BaseModel):
    access_token: str
    token_type: str = "bearer"

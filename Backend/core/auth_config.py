"""Auth settings and the two fixed accounts.

There is no signup flow and no users table row for these two accounts —
"exactly one admin, exactly one user" is a fixed business rule, not data, so
the credentials live here as hashed constants rather than as seeded database
rows. Checking a login here is a dict lookup + one bcrypt comparison, no DB
round-trip needed.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class AuthSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    jwt_secret: str
    jwt_refresh_secret: str
    jwt_algorithm: str = "HS256"
    # Short-lived on purpose now that a refresh token exists to renew it
    # silently — limits how long a leaked access token stays useful.
    jwt_expires_minutes: int = 15
    jwt_refresh_expires_days: int = 30


@lru_cache
def get_auth_settings() -> AuthSettings:
    return AuthSettings()  # type: ignore[call-arg]  # populated from env/.env at runtime


# Password hashes below are bcrypt of the literal passwords the user specified
# (admin@123 / hunar.ai@2021), generated once via bcrypt.hashpw. Never store
# or log the plaintext anywhere else.
ACCOUNTS = {
    "varun30ec4@gmail.com": {
        "password_hash": "$2b$12$dT5RRZUkOPBc5f3R2wk/Nu8slP8f8pH860g3fM50HqTc8ogSypGsK",
        "role": "admin",
    },
    "user@hunar.ai.com": {
        "password_hash": "$2b$12$lJ/9nOLjAO7GGSyC2I6w9uP33JzGAetPa48sQhXKWrprFEoTl5Tdy",
        "role": "user",
    },
}

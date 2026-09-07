"""One-way hashing for suppression identifiers.

suppression_list stores identifier_hash, never the raw phone or email — a
do-not-call list is a list of people who asked NOT to be contacted, so
holding their contact details in plaintext is exactly the data you don't
want. Lookups hash the candidate's identifier and compare hashes.

Salted with JWT_SECRET so the hashes aren't reversible via a rainbow table
of every possible phone number (the search space for E.164 is small enough
that unsalted SHA-256 would be trivially brute-forced).
"""

from __future__ import annotations

import hashlib

from core.auth_config import get_auth_settings
from services.hunar_call_service import normalise_phone


def hash_identifier(identifier_type: str, value: str) -> str:
    """Normalises then hashes. Normalisation matters: "+91 630 574 1824"
    and "+916305741824" are the same person and must produce one hash.
    """
    if identifier_type == "phone":
        normalised = normalise_phone(value)
    elif identifier_type == "email":
        normalised = value.strip().lower()
    else:  # linkedin — compare on the slug, ignoring URL noise
        normalised = value.strip().lower().rstrip("/").rsplit("/", 1)[-1]

    salted = f"{get_auth_settings().jwt_secret}:{identifier_type}:{normalised}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()

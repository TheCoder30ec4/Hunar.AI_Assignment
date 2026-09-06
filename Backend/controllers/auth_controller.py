"""HTTP boundary for auth: validates the request into a DTO, calls the
service, maps service exceptions to HTTP status codes. No business logic here.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from dtos.auth_dto import LoginRequestDTO, LoginResponseDTO
from services.auth_service import InvalidCredentialsError, login_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponseDTO)
def login(request: LoginRequestDTO) -> LoginResponseDTO:
    try:
        return login_service(request)
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        ) from exc

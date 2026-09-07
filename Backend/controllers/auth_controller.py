"""HTTP boundary for auth: validates the request into a DTO, calls the
service, maps service exceptions to HTTP status codes. No business logic here.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from dtos.auth_dto import LoginRequestDTO, LoginResponseDTO, RefreshRequestDTO, RefreshResponseDTO
from services.auth_service import InvalidCredentialsError, login_service, refresh_service

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


@router.post("/refresh", response_model=RefreshResponseDTO)
def refresh(request: RefreshRequestDTO) -> RefreshResponseDTO:
    try:
        return refresh_service(request)
    except InvalidCredentialsError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token is invalid or expired. Log in again.",
        ) from exc


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout() -> None:
    """Tokens are stateless JWTs with no server-side session to invalidate —
    logging out is discarding both tokens client-side. This endpoint exists
    so the frontend has one real call to make on logout (and a natural place
    to add server-side revocation later) rather than nothing at all.
    """
    return None

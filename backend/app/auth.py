import hashlib
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import ApiToken, User

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    if token.startswith("es_"):
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        api_token = db.query(ApiToken).filter(ApiToken.token_hash == token_hash).first()

        if api_token is None or api_token.revoked_at is not None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked API token",
            )

        user = db.query(User).filter(User.id == api_token.user_id).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="API token user not found",
            )

        api_token.last_used_at = datetime.now(timezone.utc)
        db.commit()
        return user

    supabase_url = settings["SUPABASE_URL"]
    if not supabase_url:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Supabase config missing",
        )

    try:
        response = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings["SUPABASE_ANON_KEY"],
                "Content-Type": "application/json",
            },
            timeout=15.0,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate Supabase session",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    payload: dict[str, Any] = response.json()
    user_id = payload.get("id")
    email = payload.get("email")
    metadata = payload.get("user_metadata") or {}
    name = metadata.get("full_name") or metadata.get("name") or email or "User"
    avatar_url = metadata.get("avatar_url")

    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed Supabase user payload",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None and email:
        user = db.query(User).filter(User.email == email).first()

    if user is None:
        user = User(
            id=user_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
        )
        db.add(user)
    else:
        user.email = email or user.email
        user.name = name or user.name
        user.avatar_url = avatar_url or user.avatar_url

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        user = db.query(User).filter(User.id == user_id).first()
        if user is None and email:
            user = db.query(User).filter(User.email == email).first()
        if user is None:
            raise
        user.email = email or user.email
        user.name = name or user.name
        user.avatar_url = avatar_url or user.avatar_url
        db.commit()

    db.refresh(user)
    return user

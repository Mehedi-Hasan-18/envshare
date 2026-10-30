import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ApiToken, User
from app.ratelimit import limiter

router = APIRouter(prefix="/tokens", tags=["tokens"])


class CreateTokenRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


@router.post("")
@limiter.limit("10/minute")
def create_token(
    request: Request,
    payload: CreateTokenRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    raw_token = "es_" + secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    token_row = ApiToken(
        user_id=current_user.id,
        name=payload.name.strip(),
        token_hash=token_hash,
    )
    db.add(token_row)
    db.commit()
    db.refresh(token_row)

    return {
        "id": token_row.id,
        "name": token_row.name,
        "token": raw_token,
        "created_at": token_row.created_at.isoformat(),
    }


@router.get("")
@limiter.limit("10/minute")
def list_tokens(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ApiToken)
        .filter(ApiToken.user_id == current_user.id)
        .order_by(ApiToken.created_at.desc())
        .all()
    )

    return [
        {
            "id": row.id,
            "name": row.name,
            "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
            "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.delete("/{token_id}")
@limiter.limit("10/minute")
def revoke_token(
    request: Request,
    token_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(ApiToken)
        .filter(ApiToken.id == token_id, ApiToken.user_id == current_user.id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Token not found")

    if row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()

    return {"status": "revoked", "id": row.id}

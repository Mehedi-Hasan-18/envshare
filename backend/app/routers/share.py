import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ShareLink
from app.ratelimit import limiter

router = APIRouter(prefix="/share", tags=["share"])


class ShareLinkCreateRequest(BaseModel):
    ciphertext: str = Field(..., min_length=1)
    iv: str = Field(..., min_length=1)
    ttl_hours: int = Field(default=24, ge=1, le=168)


@router.post("")
@limiter.limit("10/minute")
def create_share_link(
    request: Request,
    payload: ShareLinkCreateRequest,
    db: Session = Depends(get_db),
):
    if len(payload.ciphertext.encode("utf-8")) > 100 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Shared content exceeds 100 KB limit")

    share_id = "es_share_" + secrets.token_urlsafe(18)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.ttl_hours)

    link = ShareLink(id=share_id, ciphertext=payload.ciphertext, iv=payload.iv, expires_at=expires_at)
    db.add(link)
    db.commit()

    return {"id": share_id, "expires_at": expires_at.isoformat()}


@router.get("/{share_id}")
@limiter.limit("10/minute")
def get_share_link(
    request: Request,
    share_id: str,
    db: Session = Depends(get_db),
):
    link = db.query(ShareLink).filter(ShareLink.id == share_id).first()
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared link not found")

    expires_at = link.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    if expires_at <= now:
        db.delete(link)
        db.commit()
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared link has expired")

    payload = {
        "id": link.id,
        "ciphertext": link.ciphertext,
        "iv": link.iv,
        "expires_at": link.expires_at.isoformat(),
    }

    db.delete(link)
    db.commit()
    return payload

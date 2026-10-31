import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.deps import log_audit
from app.models import Invite, Team, TeamMember, User

router = APIRouter(prefix="/invites", tags=["invites"])


@router.post("/{token}/accept")
def accept_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    invite = db.query(Invite).filter(Invite.token_hash == token_hash).first()

    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    team = db.query(Team).filter(Team.id == invite.team_id).first()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    membership = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id)
        .first()
    )
    if membership is not None:
        return {"status": "accepted", "team_id": team.id, "already_member": True}

    if invite.used_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite has already been used")

    expires_at = invite.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    now = datetime.now(timezone.utc)
    if expires_at < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite has expired")

    db.add(TeamMember(team_id=team.id, user_id=current_user.id, role="member"))
    invite.used_at = now
    log_audit(db, team.id, current_user.id, "member_joined", team.name)
    db.commit()

    return {"status": "accepted", "team_id": team.id, "already_member": False}

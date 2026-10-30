from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.deps import log_audit, require_team_member, require_team_owner
from app.models import AuditLog, Team, TeamMember, User

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamCreateRequest(BaseModel):
    name: str


@router.post("")
def create_team(
    payload: TeamCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Team name is required")

    team = Team(name=name, owner_id=current_user.id)
    db.add(team)
    db.flush()

    owner_member = TeamMember(team_id=team.id, user_id=current_user.id, role="owner")
    db.add(owner_member)
    db.commit()
    db.refresh(team)

    return {
        "id": team.id,
        "name": team.name,
        "owner_id": team.owner_id,
    }


@router.get("")
def list_teams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership_ids = [
        row.team_id for row in db.query(TeamMember).filter(TeamMember.user_id == current_user.id).all()
    ]
    if not membership_ids:
        return []

    teams = db.query(Team).filter(Team.id.in_(membership_ids)).all()
    return [
        {
            "id": team.id,
            "name": team.name,
            "owner_id": team.owner_id,
            "created_at": team.created_at.isoformat(),
        }
        for team in teams
    ]


@router.get("/{team_id}/members")
def list_members(
    team: Team = Depends(require_team_member),
    db: Session = Depends(get_db),
):
    rows = db.query(TeamMember).filter(TeamMember.team_id == team.id).all()
    member_user_ids = [row.user_id for row in rows]
    users = db.query(User).filter(User.id.in_(member_user_ids)).all()
    users_by_id = {user.id: user for user in users}

    return [
        {
            "id": row.id,
            "team_id": row.team_id,
            "user_id": row.user_id,
            "role": row.role,
            "name": users_by_id.get(row.user_id).name if users_by_id.get(row.user_id) else None,
            "email": users_by_id.get(row.user_id).email if users_by_id.get(row.user_id) else None,
        }
        for row in rows
    ]


@router.get("/{team_id}/audit")
def list_audit_logs(
    team: Team = Depends(require_team_member),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.team_id == team.id)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
        .all()
    )

    user_ids = {row.user_id for row in rows}
    users = db.query(User).filter(User.id.in_(list(user_ids))).all() if user_ids else []
    users_by_id = {user.id: user for user in users}

    return [
        {
            "id": row.id,
            "team_id": row.team_id,
            "user_id": row.user_id,
            "action": row.action,
            "target": row.target,
            "user_name": users_by_id.get(row.user_id).name if users_by_id.get(row.user_id) else "Unknown user",
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.delete("/{team_id}/members/{user_id}")
def remove_member(
    team_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    team = require_team_owner(team_id=team_id, current_user=current_user, db=db)

    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Owner cannot remove self")

    membership = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    db.delete(membership)
    log_audit(db, team_id, current_user.id, "member_removed", f"{team.name} / {user_id}")
    db.commit()
    return {"status": "removed"}


@router.post("/{team_id}/invites")
def create_invite(
    team: Team = Depends(require_team_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.models import Invite
    import hashlib
    import secrets

    raw_token = "es_invite_" + secrets.token_urlsafe(24)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    invite = Invite(team_id=team.id, token_hash=token_hash, created_by=current_user.id, expires_at=expires_at)
    db.add(invite)
    log_audit(db, team.id, current_user.id, "invite_created", team.name)
    db.commit()

    return {"token": raw_token, "expires_at": expires_at.isoformat()}

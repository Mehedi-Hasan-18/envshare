from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.deps import log_audit, require_team_member
from app.models import Environment, EnvVersion, Project, Team, TeamMember, User

router = APIRouter(tags=["versions"])

MAX_CIPHERTEXT_BYTES = 100 * 1024


class EnvVersionCreateRequest(BaseModel):
    ciphertext: str = Field(..., min_length=1)
    iv: str = Field(..., min_length=1)
    key_names: list[str] = Field(default_factory=list)
    message: str | None = None


def get_environment_context(db: Session, env_id: str, current_user: User):
    environment = db.query(Environment).filter(Environment.id == env_id).first()
    if environment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Environment not found")

    project = db.query(Project).filter(Project.id == environment.project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    team = db.query(Team).filter(Team.id == project.team_id).first()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    membership = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.user_id == current_user.id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this team")

    return environment, project, team


@router.post("/environments/{env_id}/versions")
def push_env_version(
    env_id: str,
    payload: EnvVersionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    environment, project, team = get_environment_context(db, env_id, current_user)

    if len(payload.ciphertext.encode("utf-8")) > MAX_CIPHERTEXT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Ciphertext exceeds 100 KB limit",
        )

    last_version = (
        db.query(EnvVersion)
        .filter(EnvVersion.environment_id == environment.id)
        .order_by(EnvVersion.version_number.desc())
        .first()
    )
    next_number = (last_version.version_number + 1) if last_version else 1

    version = EnvVersion(
        environment_id=environment.id,
        version_number=next_number,
        ciphertext=payload.ciphertext,
        iv=payload.iv,
        key_names=payload.key_names,
        pushed_by=current_user.id,
        message=payload.message.strip() if payload.message and payload.message.strip() else None,
    )
    db.add(version)
    log_audit(
        db,
        team.id,
        current_user.id,
        "push",
        f"{project.name}/{environment.name}#v{next_number}",
    )
    db.commit()
    db.refresh(version)

    return {
        "id": version.id,
        "environment_id": version.environment_id,
        "version_number": version.version_number,
        "ciphertext": version.ciphertext,
        "iv": version.iv,
        "key_names": version.key_names,
        "message": version.message,
        "pushed_by": version.pushed_by,
        "created_at": version.created_at.isoformat(),
    }


@router.get("/environments/{env_id}/versions")
def list_env_versions(
    env_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    environment, project, team = get_environment_context(db, env_id, current_user)

    versions = (
        db.query(EnvVersion)
        .filter(EnvVersion.environment_id == environment.id)
        .order_by(EnvVersion.version_number.desc())
        .all()
    )
    return [
        {
            "id": version.id,
            "environment_id": version.environment_id,
            "version_number": version.version_number,
            "key_names": version.key_names,
            "message": version.message,
            "pushed_by": version.pushed_by,
            "created_at": version.created_at.isoformat(),
        }
        for version in versions
    ]


@router.get("/environments/{env_id}/versions/latest")
def get_latest_env_version(
    env_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    environment, project, team = get_environment_context(db, env_id, current_user)

    version = (
        db.query(EnvVersion)
        .filter(EnvVersion.environment_id == environment.id)
        .order_by(EnvVersion.version_number.desc())
        .first()
    )
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No versions found")

    log_audit(db, team.id, current_user.id, "pull", f"{project.name}/{environment.name}#latest")
    db.commit()

    return {
        "id": version.id,
        "environment_id": version.environment_id,
        "version_number": version.version_number,
        "ciphertext": version.ciphertext,
        "iv": version.iv,
        "key_names": version.key_names,
        "message": version.message,
        "pushed_by": version.pushed_by,
        "created_at": version.created_at.isoformat(),
    }


@router.get("/environments/{env_id}/versions/{version_number}")
def get_env_version_by_number(
    env_id: str,
    version_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    environment, project, team = get_environment_context(db, env_id, current_user)

    version = (
        db.query(EnvVersion)
        .filter(EnvVersion.environment_id == environment.id, EnvVersion.version_number == version_number)
        .first()
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Version not found",
        )

    log_audit(db, team.id, current_user.id, "pull", f"{project.name}/{environment.name}#v{version_number}")
    db.commit()

    return {
        "id": version.id,
        "environment_id": version.environment_id,
        "version_number": version.version_number,
        "ciphertext": version.ciphertext,
        "iv": version.iv,
        "key_names": version.key_names,
        "message": version.message,
        "pushed_by": version.pushed_by,
        "created_at": version.created_at.isoformat(),
    }

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.deps import log_audit, require_team_member, require_team_owner
from app.models import Environment, Project, Team, TeamMember, User

router = APIRouter(tags=["projects"])


class ProjectCreateRequest(BaseModel):
    name: str


@router.post("/teams/{team_id}/projects")
def create_project(
    team_id: str,
    payload: ProjectCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    team: Team = Depends(require_team_member),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")

    project = Project(team_id=team.id, name=name)
    db.add(project)
    db.flush()

    for env_name in ["development", "staging", "production"]:
        db.add(Environment(project_id=project.id, name=env_name))

    log_audit(db, team.id, current_user.id, "project_created", f"{project.name}")
    db.commit()

    return {
        "id": project.id,
        "name": project.name,
        "team_id": project.team_id,
        "environments": [{"id": env.id, "name": env.name} for env in db.query(Environment).filter(Environment.project_id == project.id).all()],
    }


@router.get("/teams/{team_id}/projects")
def list_projects(
    team_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    team: Team = Depends(require_team_member),
):
    projects = db.query(Project).filter(Project.team_id == team.id).all()
    return [
        {
            "id": project.id,
            "name": project.name,
            "team_id": project.team_id,
            "environments": [
                {"id": environment.id, "name": environment.name}
                for environment in db.query(Environment).filter(Environment.project_id == project.id).all()
            ],
        }
        for project in projects
    ]


@router.delete("/projects/{project_id}")
def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    require_team_owner(team_id=project.team_id, current_user=current_user, db=db)

    child_envs = db.query(Environment).filter(Environment.project_id == project_id).all()
    for env in child_envs:
        db.delete(env)
    db.delete(project)
    db.commit()
    return {"status": "deleted"}

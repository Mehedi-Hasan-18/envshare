from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.database import Base, engine
from app.ratelimit import limiter
from app.routers.auth import router as auth_router
from app.routers.invites import router as invites_router
from app.routers.projects import router as projects_router
from app.routers.share import router as share_router
from app.routers.teams import router as teams_router
from app.routers.tokens import router as tokens_router
from app.routers.versions import router as versions_router

app = FastAPI(title="EnvShare API")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

allowed_origins = [
    settings["FRONTEND_URL"],
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup_event():
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"Database startup skipped: {exc}")


app.include_router(auth_router, prefix="/api")
app.include_router(teams_router, prefix="/api")
app.include_router(invites_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(versions_router, prefix="/api")
app.include_router(share_router, prefix="/api")
app.include_router(tokens_router, prefix="/api")


@app.get("/")
@app.get("/api")
def api_root():
    return {
        "service": "EnvShare API",
        "status": "ok",
        "docs": "/docs",
        "health": "/health",
        "api_health": "/api/health",
    }


@app.get("/health")
@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "EnvShare API"}


if __name__ == "__main__":
    import uvicorn

    port = int(settings.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)

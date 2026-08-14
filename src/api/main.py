"""
HireFlow AI — FastAPI Application Entrypoint

Start the development server:
    uvicorn src.api.main:app --reload

Browse the interactive docs:
    http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes.applications import router as applications_router
from src.api.routes.hiring import router as hiring_router
from src.api.routes.prep_guide import router as prep_guide_router
from src.api.routes.profile import router as profile_router
from src.api.routes.reports import router as reports_router
from src.api.routes.weekly_plan import router as weekly_plan_router
from src.config.settings import get_settings

app = FastAPI(
    title="HireFlow AI API",
    description=(
        "Career autopilot for students. "
        "Discovers jobs, tailors resumes, applies automatically, "
        "and generates personalised prep guides."
    ),
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# --------------------------------------------------------------------------- #
# CORS — allow the frontend dev server (http://localhost:3000) to call the API
# --------------------------------------------------------------------------- #

_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    # Comma-separated in .env (e.g. ALLOWED_ORIGINS=http://localhost:3000)
    allow_origins=[
        origin.strip()
        for origin in _settings.ALLOWED_ORIGINS.split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------- #
# Routers
# --------------------------------------------------------------------------- #

app.include_router(profile_router)
app.include_router(weekly_plan_router)
app.include_router(applications_router)
app.include_router(prep_guide_router)
app.include_router(reports_router)
app.include_router(hiring_router)

# --------------------------------------------------------------------------- #
# Health check
# --------------------------------------------------------------------------- #


@app.get("/", tags=["health"])
def health_check() -> dict:
    """Basic liveness probe.

    Returns a simple JSON object confirming the API is running.
    Useful for Docker health checks and load-balancer probes.
    """
    return {"status": "ok", "service": "hireflow-api"}

"""
Kegelkasse API — FastAPI application entry point.
Serves the React PWA from /static and exposes REST API under /api/v1.
"""
import os
import re
import tomllib
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request

with open(Path(__file__).parent.parent / "pyproject.toml", "rb") as _f:
    __version__ = tomllib.load(_f)["tool"]["poetry"]["version"]
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from api.v1 import auth, backups, club, committee, evenings, push, reports, schedule, stats, sync, superadmin
from core.events import event_bus
from core.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(_app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="Kegelkasse API",
    version=__version__,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

_EVENING_PATH_RE = re.compile(r"^/api/v1/evening/(\d+)/.+")


@app.middleware("http")
async def notify_evening_on_mutate(request: Request, call_next):
    response = await call_next(request)
    if request.method in ("POST", "PATCH", "DELETE") and response.status_code < 300:
        m = _EVENING_PATH_RE.match(request.url.path)
        if m:
            await event_bus.publish(int(m.group(1)))
    return response


# CORS — wide open in development, locked down in production
cors_origins = ["*"] if os.getenv("ENVIRONMENT") == "development" else []
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(auth.router, prefix="/api/v1")
app.include_router(club.router, prefix="/api/v1")
app.include_router(evenings.router, prefix="/api/v1")
app.include_router(stats.router, prefix="/api/v1")
app.include_router(sync.router, prefix="/api/v1")
app.include_router(superadmin.router, prefix="/api/v1")
app.include_router(push.router, prefix="/api/v1")
app.include_router(schedule.router, prefix="/api/v1")
app.include_router(committee.router, prefix="/api/v1")
app.include_router(backups.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": __version__}


# Serve Docusaurus docs at /docs
docs_static_dir = os.path.join(os.path.dirname(__file__), "..", "docs_static")
if os.path.exists(docs_static_dir):
    app.mount("/docs", StaticFiles(directory=docs_static_dir, html=True), name="docs")

# Serve uploaded files (club logos, etc.)
uploads_dir = "/app/uploads"
try:
    os.makedirs(uploads_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
except (PermissionError, OSError):
    pass  # uploads dir not available (e.g., in CI / test environment)

# Serve React PWA
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")


    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        file_path = os.path.join(static_dir, full_path)
        if full_path and os.path.isfile(file_path):
            resp = FileResponse(file_path)
            # Service worker must never be stale — browser checks on every load
            if full_path == "sw.js":
                resp.headers["Cache-Control"] = "no-cache"
            return resp
        resp = FileResponse(os.path.join(static_dir, "index.html"))
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return resp

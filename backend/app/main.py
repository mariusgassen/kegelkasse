"""
Kegelkasse API — FastAPI application entry point.
Serves the React PWA from /static and exposes REST API under /api/v1.
"""
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.api.v1 import auth, club, evenings, stats, sync

app = FastAPI(
    title="Kegelkasse API",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json"
)

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

@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}

# Serve React PWA
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.exists(static_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(os.path.join(static_dir, "index.html"))

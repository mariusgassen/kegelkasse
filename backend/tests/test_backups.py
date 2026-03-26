"""
Tests for the backup management endpoints (superadmin only):
  GET    /backups             — list backup info
  POST   /backups             — trigger manual backup
  GET    /backups/{label}/download — stream backup as tar.gz
  DELETE /backups/{label}    — delete backup

All pgbackrest service calls are mocked so no real Docker/pgbackrest needed.
"""
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def superadmin(db: Session, club: Club) -> User:
    u = User(
        email="superadmin_backup@test.de",
        name="Backup Superadmin",
        hashed_password=get_password_hash("pass"),
        role=UserRole.superadmin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def superadmin_headers(superadmin: User) -> dict:
    token = create_access_token({"sub": str(superadmin.id)})
    return {"Authorization": f"Bearer {token}"}


FAKE_BACKUP_INFO = {
    "status": "ok",
    "stanza": [{"name": "kegelkasse", "status": {"code": 0, "message": "ok"}}],
}

FAKE_BACKUP_CONFIG = {"retention": "2", "type": "posix"}


# ---------------------------------------------------------------------------
# GET /backups
# ---------------------------------------------------------------------------

class TestGetBackups:
    def test_returns_backup_info(self, client, superadmin_headers):
        with (
            patch("api.v1.backups.get_backup_info", new=AsyncMock(return_value=FAKE_BACKUP_INFO)),
            patch("api.v1.backups.get_backup_config", new=AsyncMock(return_value=FAKE_BACKUP_CONFIG)),
        ):
            r = client.get("/api/v1/backups", headers=superadmin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "info" in data
        assert "config" in data

    def test_502_when_pgbackrest_unavailable(self, client, superadmin_headers):
        with patch("api.v1.backups.get_backup_info", new=AsyncMock(side_effect=Exception("connection refused"))):
            r = client.get("/api/v1/backups", headers=superadmin_headers)
        assert r.status_code == 502

    def test_member_forbidden(self, client, auth_headers):
        r = client.get("/api/v1/backups", headers=auth_headers)
        assert r.status_code == 403

    def test_401_without_auth(self, client):
        r = client.get("/api/v1/backups")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /backups  — trigger manual backup
# ---------------------------------------------------------------------------

class TestCreateBackup:
    def test_triggers_backup_and_returns_result(self, client, superadmin_headers):
        result = {"type": "full", "label": "20250101-120000F", "status": "ok"}
        with patch("api.v1.backups.run_backup", new=AsyncMock(return_value=result)):
            r = client.post("/api/v1/backups", headers=superadmin_headers)
        assert r.status_code == 200
        assert r.json()["type"] == "full"

    def test_500_on_backup_failure(self, client, superadmin_headers):
        with patch("api.v1.backups.run_backup", new=AsyncMock(side_effect=Exception("disk full"))):
            r = client.post("/api/v1/backups", headers=superadmin_headers)
        assert r.status_code == 500

    def test_member_forbidden(self, client, auth_headers):
        r = client.post("/api/v1/backups", headers=auth_headers)
        assert r.status_code == 403

    def test_401_without_auth(self, client):
        r = client.post("/api/v1/backups")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# GET /backups/{label}/download
# ---------------------------------------------------------------------------

class TestDownloadBackup:
    VALID_LABEL = "20250101-120000F"

    def test_streams_backup_file(self, client, superadmin_headers):
        from fastapi.responses import StreamingResponse
        import io
        fake_response = StreamingResponse(
            io.BytesIO(b"fake-tar-gz-content"),
            media_type="application/gzip",
            headers={"Content-Disposition": f'attachment; filename="{self.VALID_LABEL}.tar.gz"'},
        )
        with patch("api.v1.backups.stream_backup", new=AsyncMock(return_value=fake_response)):
            r = client.get(f"/api/v1/backups/{self.VALID_LABEL}/download", headers=superadmin_headers)
        assert r.status_code == 200

    def test_404_when_backup_not_found(self, client, superadmin_headers):
        with patch("api.v1.backups.stream_backup", new=AsyncMock(side_effect=FileNotFoundError("not found"))):
            r = client.get(f"/api/v1/backups/{self.VALID_LABEL}/download", headers=superadmin_headers)
        assert r.status_code == 404

    def test_invalid_label_returns_400(self, client, superadmin_headers):
        r = client.get("/api/v1/backups/../etc/passwd/download", headers=superadmin_headers)
        # Path traversal is blocked: either 400 (invalid label) or 404/405 from router
        assert r.status_code in (400, 404, 405)

    def test_member_forbidden(self, client, auth_headers):
        r = client.get(f"/api/v1/backups/{self.VALID_LABEL}/download", headers=auth_headers)
        assert r.status_code == 403

    def test_401_without_auth(self, client):
        r = client.get(f"/api/v1/backups/{self.VALID_LABEL}/download")
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# DELETE /backups/{label}
# ---------------------------------------------------------------------------

class TestDeleteBackup:
    VALID_LABEL = "20250101-120000F"

    def test_deletes_backup(self, client, superadmin_headers):
        with patch("api.v1.backups.delete_backup", new=AsyncMock(return_value=None)):
            r = client.delete(f"/api/v1/backups/{self.VALID_LABEL}", headers=superadmin_headers)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_404_when_backup_not_found(self, client, superadmin_headers):
        with patch("api.v1.backups.delete_backup", new=AsyncMock(side_effect=FileNotFoundError("not found"))):
            r = client.delete(f"/api/v1/backups/{self.VALID_LABEL}", headers=superadmin_headers)
        assert r.status_code == 404

    def test_500_on_error(self, client, superadmin_headers):
        with patch("api.v1.backups.delete_backup", new=AsyncMock(side_effect=Exception("pgbackrest error"))):
            r = client.delete(f"/api/v1/backups/{self.VALID_LABEL}", headers=superadmin_headers)
        assert r.status_code == 500

    def test_invalid_label_returns_400(self, client, superadmin_headers):
        r = client.delete("/api/v1/backups/../../etc/shadow", headers=superadmin_headers)
        assert r.status_code in (400, 404, 405)

    def test_member_forbidden(self, client, auth_headers):
        r = client.delete(f"/api/v1/backups/{self.VALID_LABEL}", headers=auth_headers)
        assert r.status_code == 403

    def test_401_without_auth(self, client):
        r = client.delete(f"/api/v1/backups/{self.VALID_LABEL}")
        assert r.status_code == 401

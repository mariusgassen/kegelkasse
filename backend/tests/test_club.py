"""
Tests for club management endpoints:
  GET  /club/                  — read club info & settings
  PATCH /club/settings         — update club settings (admin)
  POST  /club/logo             — upload club logo (admin)
  DELETE /club/logo            — remove club logo (admin)
"""
import io
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.user import User, UserRole


# ---------------------------------------------------------------------------
# Extra fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_club_settings(db: Session, club: Club):
    """Remove ClubSettings for the test club after each test so conftest club teardown can delete Club."""
    yield
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()


@pytest.fixture()
def admin_user(db: Session, club: Club) -> User:
    u = User(
        email="admin@test.de",
        name="Test Admin",
        hashed_password=get_password_hash("adminpass"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def admin_headers(admin_user: User) -> dict:
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def club_with_settings(db: Session, club: Club) -> Club:
    s = ClubSettings(
        club_id=club.id,
        home_venue="Gasthaus Krone",
        primary_color="#e8a020",
        secondary_color="#6b7c5a",
        extra={"bg_color": "#1a1410", "ical_token": "test-ical-token"},
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return club


# ---------------------------------------------------------------------------
# GET /club/
# ---------------------------------------------------------------------------

class TestGetClub:
    def test_returns_club_info(self, client: TestClient, auth_headers: dict, club_with_settings: Club):
        resp = client.get("/api/v1/club/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == club_with_settings.name
        assert "settings" in data
        assert data["settings"]["home_venue"] == "Gasthaus Krone"
        assert data["settings"]["primary_color"] == "#e8a020"

    def test_settings_include_logo_url(self, client: TestClient, auth_headers: dict, club_with_settings: Club):
        resp = client.get("/api/v1/club/", headers=auth_headers)
        assert resp.status_code == 200
        # logo_url is null until a logo is uploaded
        assert "logo_url" in resp.json()["settings"]

    def test_requires_authentication(self, client: TestClient, club: Club):
        resp = client.get("/api/v1/club/")
        assert resp.status_code == 401

    def test_auto_creates_ical_token(self, client: TestClient, auth_headers: dict, db: Session, club: Club):
        # Settings without ical_token
        s = ClubSettings(club_id=club.id, extra={})
        db.add(s)
        db.commit()

        resp = client.get("/api/v1/club/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        # ical_token should now be auto-generated
        assert data["settings"]["ical_token"] is not None
        assert len(data["settings"]["ical_token"]) > 10


# ---------------------------------------------------------------------------
# PATCH /club/settings
# ---------------------------------------------------------------------------

class TestUpdateClubSettings:
    def test_admin_can_update_colors(self, client: TestClient, admin_headers: dict, club_with_settings: Club):
        resp = client.patch("/api/v1/club/settings", headers=admin_headers,
                            json={"primary_color": "#ff0000", "secondary_color": "#00ff00"})
        assert resp.status_code == 200

        verify = client.get("/api/v1/club/", headers=admin_headers)
        settings = verify.json()["settings"]
        assert settings["primary_color"] == "#ff0000"
        assert settings["secondary_color"] == "#00ff00"

    def test_admin_can_update_club_name(self, client: TestClient, admin_headers: dict, club_with_settings: Club):
        resp = client.patch("/api/v1/club/settings", headers=admin_headers,
                            json={"name": "Neuer Vereinsname"})
        assert resp.status_code == 200

        verify = client.get("/api/v1/club/", headers=admin_headers)
        assert verify.json()["name"] == "Neuer Vereinsname"

    def test_admin_can_set_extra_fields(self, client: TestClient, admin_headers: dict, club_with_settings: Club):
        resp = client.patch("/api/v1/club/settings", headers=admin_headers,
                            json={"guest_penalty_cap": 15.0, "paypal_me": "meinverein"})
        assert resp.status_code == 200

        verify = client.get("/api/v1/club/", headers=admin_headers)
        settings = verify.json()["settings"]
        assert settings["guest_penalty_cap"] == 15.0
        assert settings["paypal_me"] == "meinverein"

    def test_member_cannot_update_settings(self, client: TestClient, auth_headers: dict, club_with_settings: Club):
        resp = client.patch("/api/v1/club/settings", headers=auth_headers,
                            json={"primary_color": "#000000"})
        assert resp.status_code == 403

    def test_unauthenticated_cannot_update(self, client: TestClient, club: Club):
        resp = client.patch("/api/v1/club/settings", json={"name": "Hacker"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /club/logo
# ---------------------------------------------------------------------------

class TestUploadClubLogo:
    def _make_png_bytes(self) -> bytes:
        """Minimal 1×1 PNG (89 bytes)."""
        return (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00'
            b'\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx'
            b'\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00'
            b'\x00IEND\xaeB`\x82'
        )

    def test_admin_can_upload_png(self, client: TestClient, admin_headers: dict, club_with_settings: Club, tmp_path):
        upload_dir = tmp_path / "logos"
        upload_dir.mkdir()

        with patch("api.v1.club._UPLOAD_DIR", upload_dir):
            resp = client.post(
                "/api/v1/club/logo",
                headers=admin_headers,
                files={"file": ("logo.png", io.BytesIO(self._make_png_bytes()), "image/png")},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert "logo_url" in data
        assert data["logo_url"].startswith("/uploads/logos/")
        assert data["logo_url"].endswith(".png")

    def test_logo_url_persisted_in_settings(self, client: TestClient, admin_headers: dict, club_with_settings: Club, tmp_path):
        upload_dir = tmp_path / "logos"
        upload_dir.mkdir()

        with patch("api.v1.club._UPLOAD_DIR", upload_dir):
            client.post(
                "/api/v1/club/logo",
                headers=admin_headers,
                files={"file": ("logo.png", io.BytesIO(self._make_png_bytes()), "image/png")},
            )

        verify = client.get("/api/v1/club/", headers=admin_headers)
        logo_url = verify.json()["settings"]["logo_url"]
        assert logo_url is not None
        assert logo_url.startswith("/uploads/logos/")

    def test_rejects_unsupported_content_type(self, client: TestClient, admin_headers: dict, club_with_settings: Club):
        resp = client.post(
            "/api/v1/club/logo",
            headers=admin_headers,
            files={"file": ("doc.pdf", io.BytesIO(b"fake-pdf"), "application/pdf")},
        )
        assert resp.status_code == 400
        assert "Unsupported" in resp.json()["detail"]

    def test_member_cannot_upload_logo(self, client: TestClient, auth_headers: dict, club_with_settings: Club):
        resp = client.post(
            "/api/v1/club/logo",
            headers=auth_headers,
            files={"file": ("logo.png", io.BytesIO(self._make_png_bytes()), "image/png")},
        )
        assert resp.status_code == 403

    def test_rejects_oversized_file(self, client: TestClient, admin_headers: dict, club_with_settings: Club, tmp_path):
        upload_dir = tmp_path / "logos"
        upload_dir.mkdir()

        # 6 MB of data (> 5 MB limit)
        big_data = b"x" * (6 * 1024 * 1024)
        with patch("api.v1.club._UPLOAD_DIR", upload_dir):
            resp = client.post(
                "/api/v1/club/logo",
                headers=admin_headers,
                files={"file": ("big.png", io.BytesIO(big_data), "image/png")},
            )

        assert resp.status_code == 413

    def test_accepts_webp(self, client: TestClient, admin_headers: dict, club_with_settings: Club, tmp_path):
        upload_dir = tmp_path / "logos"
        upload_dir.mkdir()

        with patch("api.v1.club._UPLOAD_DIR", upload_dir):
            resp = client.post(
                "/api/v1/club/logo",
                headers=admin_headers,
                files={"file": ("logo.webp", io.BytesIO(b"RIFF....WEBPVP8 "), "image/webp")},
            )

        assert resp.status_code == 200
        assert resp.json()["logo_url"].endswith(".webp")

    def test_accepts_svg(self, client: TestClient, admin_headers: dict, club_with_settings: Club, tmp_path):
        upload_dir = tmp_path / "logos"
        upload_dir.mkdir()
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>'

        with patch("api.v1.club._UPLOAD_DIR", upload_dir):
            resp = client.post(
                "/api/v1/club/logo",
                headers=admin_headers,
                files={"file": ("logo.svg", io.BytesIO(svg), "image/svg+xml")},
            )

        assert resp.status_code == 200
        assert resp.json()["logo_url"].endswith(".svg")


# ---------------------------------------------------------------------------
# DELETE /club/logo
# ---------------------------------------------------------------------------

class TestDeleteClubLogo:
    def test_admin_can_delete_logo(self, client: TestClient, admin_headers: dict, db: Session, club: Club, tmp_path):
        upload_dir = tmp_path / "logos"
        upload_dir.mkdir()

        # Set up settings with a logo_url
        s = ClubSettings(club_id=club.id, logo_url="/uploads/logos/test_logo.png", extra={"ical_token": "tok"})
        db.add(s)
        db.commit()

        resp = client.delete("/api/v1/club/logo", headers=admin_headers)
        assert resp.status_code == 200

        verify = client.get("/api/v1/club/", headers=admin_headers)
        assert verify.json()["settings"]["logo_url"] is None

    def test_member_cannot_delete_logo(self, client: TestClient, auth_headers: dict, club_with_settings: Club):
        resp = client.delete("/api/v1/club/logo", headers=auth_headers)
        assert resp.status_code == 403

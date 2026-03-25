"""Tests for the media upload endpoint (POST /api/v1/uploads/media)."""
import io
import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from core.security import create_access_token, get_password_hash
from models.user import User, UserRole


@pytest.fixture()
def member_user(db, club):
    u = User(
        email="uploadmember@test.de",
        name="Upload Member",
        hashed_password=get_password_hash("testpass"),
        role=UserRole.member,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    yield u


@pytest.fixture()
def member_headers(member_user):
    token = create_access_token({"sub": str(member_user.id)})
    return {"Authorization": f"Bearer {token}"}


def _fake_jpeg() -> bytes:
    """Minimal valid JPEG bytes (just the header signature)."""
    return b"\xff\xd8\xff\xe0" + b"\x00" * 16


def _fake_gif() -> bytes:
    """Minimal GIF header."""
    return b"GIF89a" + b"\x00" * 10


class TestUploadMedia:
    def test_upload_jpeg_returns_url(self, client, member_headers):
        with patch("api.v1.uploads._UPLOAD_DIR") as mock_dir:
            mock_path = MagicMock(spec=Path)
            mock_dir.__truediv__ = lambda self, name: mock_path
            mock_dir.mkdir = MagicMock()

            resp = client.post(
                "/api/v1/uploads/media",
                headers=member_headers,
                files={"file": ("photo.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "url" in data
        assert data["url"].startswith("/uploads/media/")
        assert data["url"].endswith(".jpg")

    def test_upload_png_returns_url(self, client, member_headers):
        with patch("api.v1.uploads._UPLOAD_DIR") as mock_dir:
            mock_path = MagicMock(spec=Path)
            mock_dir.__truediv__ = lambda self, name: mock_path
            mock_dir.mkdir = MagicMock()

            resp = client.post(
                "/api/v1/uploads/media",
                headers=member_headers,
                files={"file": ("image.png", io.BytesIO(b"\x89PNG\r\n"), "image/png")},
            )
        assert resp.status_code == 200
        assert resp.json()["url"].endswith(".png")

    def test_upload_gif_returns_url(self, client, member_headers):
        with patch("api.v1.uploads._UPLOAD_DIR") as mock_dir:
            mock_path = MagicMock(spec=Path)
            mock_dir.__truediv__ = lambda self, name: mock_path
            mock_dir.mkdir = MagicMock()

            resp = client.post(
                "/api/v1/uploads/media",
                headers=member_headers,
                files={"file": ("anim.gif", io.BytesIO(_fake_gif()), "image/gif")},
            )
        assert resp.status_code == 200
        assert resp.json()["url"].endswith(".gif")

    def test_upload_webp_returns_url(self, client, member_headers):
        with patch("api.v1.uploads._UPLOAD_DIR") as mock_dir:
            mock_path = MagicMock(spec=Path)
            mock_dir.__truediv__ = lambda self, name: mock_path
            mock_dir.mkdir = MagicMock()

            resp = client.post(
                "/api/v1/uploads/media",
                headers=member_headers,
                files={"file": ("img.webp", io.BytesIO(b"RIFF\x00\x00\x00\x00WEBP"), "image/webp")},
            )
        assert resp.status_code == 200
        assert resp.json()["url"].endswith(".webp")

    def test_upload_unsupported_type_returns_400(self, client, member_headers):
        resp = client.post(
            "/api/v1/uploads/media",
            headers=member_headers,
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )
        assert resp.status_code == 400
        assert "Unsupported" in resp.json()["detail"]

    def test_upload_file_too_large_returns_413(self, client, member_headers):
        big_data = b"\xff\xd8\xff\xe0" + b"\x00" * (10 * 1024 * 1024 + 1)
        resp = client.post(
            "/api/v1/uploads/media",
            headers=member_headers,
            files={"file": ("big.jpg", io.BytesIO(big_data), "image/jpeg")},
        )
        assert resp.status_code == 413

    def test_upload_requires_auth(self, client):
        resp = client.post(
            "/api/v1/uploads/media",
            files={"file": ("photo.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")},
        )
        assert resp.status_code == 401

    def test_url_includes_club_id(self, client, member_headers, member_user):
        with patch("api.v1.uploads._UPLOAD_DIR") as mock_dir:
            mock_path = MagicMock(spec=Path)
            mock_dir.__truediv__ = lambda self, name: mock_path
            mock_dir.mkdir = MagicMock()

            resp = client.post(
                "/api/v1/uploads/media",
                headers=member_headers,
                files={"file": ("photo.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")},
            )
        assert resp.status_code == 200
        url = resp.json()["url"]
        assert f"media_{member_user.club_id}_" in url

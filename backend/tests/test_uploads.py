"""Tests for the media upload endpoint (POST /api/v1/uploads/media)."""
import io
import pytest

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
        resp = client.post(
            "/api/v1/uploads/media",
            headers=member_headers,
            files={"file": ("image.png", io.BytesIO(b"\x89PNG\r\n"), "image/png")},
        )
        assert resp.status_code == 200
        assert resp.json()["url"].endswith(".png")

    def test_upload_gif_returns_url(self, client, member_headers):
        resp = client.post(
            "/api/v1/uploads/media",
            headers=member_headers,
            files={"file": ("anim.gif", io.BytesIO(_fake_gif()), "image/gif")},
        )
        assert resp.status_code == 200
        assert resp.json()["url"].endswith(".gif")

    def test_upload_webp_returns_url(self, client, member_headers):
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
        resp = client.post(
            "/api/v1/uploads/media",
            headers=member_headers,
            files={"file": ("photo.jpg", io.BytesIO(_fake_jpeg()), "image/jpeg")},
        )
        assert resp.status_code == 200
        url = resp.json()["url"]
        assert f"media_{member_user.club_id}_" in url


class TestImageSizing:
    def _jpeg(self, size, exif_orientation=None):
        import io
        from PIL import Image
        img = Image.effect_noise(size, 80).convert("RGB")
        out = io.BytesIO()
        if exif_orientation:
            exif = Image.Exif()
            exif[0x0112] = exif_orientation
            img.save(out, "JPEG", quality=95, exif=exif)
        else:
            img.save(out, "JPEG", quality=95)
        return out.getvalue()

    def test_shrink_caps_long_edge(self):
        import io
        from PIL import Image
        from core import images
        data = self._jpeg((3000, 2000))
        out = images.shrink(data, "image/jpeg")
        assert max(Image.open(io.BytesIO(out)).size) == images.MAX_SIDE
        assert len(out) < len(data)

    def test_shrink_keeps_small_and_unreadable(self):
        from core import images
        small = self._jpeg((200, 100))
        assert images.shrink(small, "image/jpeg") == small
        assert images.shrink(b"not an image", "image/jpeg") == b"not an image"
        assert images.shrink(b"GIF89a", "image/gif") == b"GIF89a"

    def test_shrink_bakes_in_rotation(self):
        import io
        from PIL import Image
        from core import images
        out = images.shrink(self._jpeg((300, 100), exif_orientation=6), "image/jpeg")
        assert Image.open(io.BytesIO(out)).size == (100, 300)

    def test_variant_width_snaps(self):
        from core import images
        assert images.nearest_width(100) == 240
        assert images.nearest_width(500) == 960
        assert images.nearest_width(9000) == 1600

    def test_serve_variant_is_smaller_and_cached(self, client, member_headers):
        import io
        from PIL import Image
        data = self._jpeg((1800, 1200))
        up = client.post("/api/v1/uploads/media", headers=member_headers,
                         files={"file": ("a.jpg", data, "image/jpeg")})
        url = up.json()["url"]
        small = client.get(url + "?w=480")
        assert small.status_code == 200
        assert max(Image.open(io.BytesIO(small.content)).size) == 480
        assert len(small.content) < len(client.get(url).content)
        assert client.get(url + "?w=480").content == small.content

    def test_variant_of_small_image_falls_back_to_original(self, client, member_headers):
        data = self._jpeg((100, 60))
        url = client.post("/api/v1/uploads/media", headers=member_headers,
                          files={"file": ("a.jpg", data, "image/jpeg")}).json()["url"]
        assert client.get(url + "?w=480").content == data

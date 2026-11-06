"""
Club-branded PWA app icons (#102):
  core/app_icon.py         — pure rendering + palette variants
  GET/PATCH /club/app-icon — admin setting with per-variant previews
  GET /app-icon/{token}/manifest.webmanifest, /app-icon/{token}/{kind}.png — public, token-gated
"""
import io

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from core import app_icon as icons
from core.security import create_access_token, get_password_hash
from models.club import Club, ClubSettings
from models.user import User, UserRole


def _png(color=(255, 0, 0, 255), size=(64, 32)) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", size, color).save(out, format="PNG")
    return out.getvalue()


def _open(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    icons.clear_cache()
    yield
    db.rollback()
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete(synchronize_session=False)
    db.commit()
    icons.clear_cache()


@pytest.fixture()
def admin_headers(db: Session, club: Club):
    u = User(email="icon-admin@test.de", name="Admin", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}


@pytest.fixture()
def logo(monkeypatch):
    """Pretend the club has an uploaded PNG logo, without touching the uploads volume."""
    data = _png()
    monkeypatch.setattr(icons, "load_logo_bytes", lambda url: data if url else None)
    return data


def _enable(client, admin_headers, **body):
    r = client.patch("/api/v1/club/app-icon", json={"enabled": True, **body}, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()


def _token(db: Session, club: Club) -> str:
    db.expire_all()
    s = db.query(ClubSettings).filter(ClubSettings.club_id == club.id).first()
    return s.extra["app_icon"]["token"]


# ── Rendering ──

class TestRendering:
    @pytest.mark.parametrize("kind", list(icons.KINDS))
    def test_sizes(self, kind):
        size, shape = icons.KINDS[kind]
        png = icons.render_icon(size, shape, "#1a1410", None, "TC", "#e8a020")
        img = _open(png)
        assert img.format == "PNG" and img.size == (size, size)

    def test_maskable_and_apple_are_opaque(self):
        for shape in ("maskable", "apple"):
            img = _open(icons.render_icon(180, shape, "#336699", None, "K", "#ffffff"))
            assert img.mode == "RGB"
            assert img.getpixel((0, 0)) == (0x33, 0x66, 0x99)

    def test_any_has_rounded_transparent_corners(self):
        img = _open(icons.render_icon(192, "any", "#336699", None, "K", "#ffffff")).convert("RGBA")
        assert img.getpixel((0, 0))[3] == 0
        assert img.getpixel((96, 4))[3] == 255

    def test_logo_is_centered_inside_safe_zone(self):
        logo = icons.decode_logo(_png((255, 0, 0, 255), (100, 100)))
        img = _open(icons.render_icon(512, "maskable", "#000000", logo, "K", "#ffffff"))
        assert img.getpixel((256, 256)) == (255, 0, 0)
        # The 80 % safe-zone circle starts at 51 px — the logo must stay well inside it.
        assert img.getpixel((256, 60)) == (0, 0, 0)

    def test_svg_logo_reported_as_not_renderable(self, client, admin_headers, db, club, monkeypatch):
        monkeypatch.setattr(icons, "load_logo_bytes", lambda url: b"<svg xmlns='http://www.w3.org/2000/svg'/>")
        db.add(ClubSettings(club_id=club.id, logo_url="/uploads/logos/x.svg"))
        db.commit()
        body = client.get("/api/v1/club/app-icon", headers=admin_headers).json()
        assert body["has_logo"] is True and body["logo_renderable"] is False

    def test_svg_and_garbage_are_not_decodable(self):
        assert icons.decode_logo(b"<svg xmlns='http://www.w3.org/2000/svg'/>") is None
        assert icons.decode_logo(b"nope") is None
        assert icons.decode_logo(None) is None

    def test_variant_backgrounds_follow_palette(self):
        assert icons.variant_background("dark", "#111111", "#222222", "#0a0a0a") == "#0a0a0a"
        assert icons.variant_background("primary", "#111111", "#222222", None) == "#111111"
        assert icons.variant_background("secondary", "#111111", "#222222", None) == "#222222"
        assert icons.variant_background("dark", None, None, None) == icons.DEFAULT_DARK_BG
        light = icons.variant_background("light", None, None, "#1a1410")
        assert icons.contrast(light, "#000000") > 12  # a genuinely light background

    def test_monogram_color_is_readable(self):
        assert icons.monogram_color("#1a1410", "#e8a020") == "#e8a020"
        # Brand color on its own fill doesn't read → black/white
        assert icons.monogram_color("#e8a020", "#e8a020") in ("#000000", "#ffffff")

    def test_initials(self):
        assert icons.initials("KC Eichhorn") == "KE"
        assert icons.initials("Pudel") == "P"
        assert icons.initials("") == "K"

    def test_load_logo_reads_through_storage(self, media_storage, tmp_path):
        media_storage.put("logos/a.png", b"x", "image/png")
        (tmp_path / "secret.png").write_bytes(b"s")
        assert icons.load_logo_bytes("/uploads/logos/a.png") == b"x"
        assert icons.load_logo_bytes("/uploads/../secret.png") is None
        assert icons.load_logo_bytes("/uploads/logos/missing.png") is None
        assert icons.load_logo_bytes("/somewhere/else.png") is None
        assert icons.load_logo_bytes(None) is None

    def test_load_logo_from_s3_with_volume_fallback(self, tmp_path):
        from core.storage import LocalStorage, S3Storage, set_storage
        from tests.test_media_storage import FakeS3
        local = LocalStorage(tmp_path / "volume")
        fake = FakeS3()
        set_storage(S3Storage(fake, "bucket", fallback=local))
        try:
            fake.put_object(Bucket="bucket", Key="logos/b.png", Body=b"bucket", ContentType="image/png")
            local.put("logos/old.png", b"volume", "image/png")
            assert icons.load_logo_bytes("/uploads/logos/b.png") == b"bucket"
            assert icons.load_logo_bytes("/uploads/logos/old.png") == b"volume"
        finally:
            set_storage(None)


# ── Admin settings ──

class TestAdminSettings:
    def test_requires_auth(self, client):
        assert client.get("/api/v1/club/app-icon").status_code == 401

    def test_member_forbidden(self, client, auth_headers):
        assert client.get("/api/v1/club/app-icon", headers=auth_headers).status_code == 403
        assert client.patch("/api/v1/club/app-icon", json={"enabled": True},
                            headers=auth_headers).status_code == 403

    def test_defaults_with_previews(self, client, admin_headers):
        r = client.get("/api/v1/club/app-icon", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is False and body["variant"] == "dark"
        assert body["has_logo"] is False
        assert [v["variant"] for v in body["variants"]] == list(icons.VARIANTS)
        assert all(v["preview"].startswith("data:image/png;base64,") for v in body["variants"])

    def test_enable_and_pick_variant(self, client, admin_headers, db, club, logo):
        db.add(ClubSettings(club_id=club.id, logo_url="/uploads/logos/x.png"))
        db.commit()
        body = _enable(client, admin_headers, variant="primary")
        assert body["enabled"] is True and body["variant"] == "primary"
        assert body["has_logo"] is True and body["logo_renderable"] is True
        assert _token(db, club)

    def test_unknown_variant_rejected(self, client, admin_headers):
        r = client.patch("/api/v1/club/app-icon", json={"variant": "neon"}, headers=admin_headers)
        assert r.status_code == 400

    def test_token_is_stable_across_updates(self, client, admin_headers, db, club):
        _enable(client, admin_headers)
        first = _token(db, club)
        _enable(client, admin_headers, variant="light")
        assert _token(db, club) == first

    def test_club_payload_exposes_urls_only_when_enabled(self, client, admin_headers, auth_headers):
        off = client.get("/api/v1/club/", headers=auth_headers).json()["settings"]["app_icon"]
        assert off["enabled"] is False and off["manifest_url"] is None
        _enable(client, admin_headers)
        on = client.get("/api/v1/club/", headers=auth_headers).json()["settings"]["app_icon"]
        assert on["manifest_url"].endswith(".webmanifest?v=" + on["icon_url"].split("v=")[1])
        assert "/apple-touch-icon.png?v=" in on["apple_touch_icon_url"]


# ── Public manifest + icons ──

class TestPublic:
    def test_unknown_token_404(self, client):
        assert client.get("/api/v1/app-icon/nope/manifest.webmanifest").status_code == 404
        assert client.get("/api/v1/app-icon/nope/icon-192.png").status_code == 404

    def test_manifest_without_login(self, client, admin_headers, db, club, logo):
        _enable(client, admin_headers, variant="secondary")
        token = _token(db, club)
        r = client.get(f"/api/v1/app-icon/{token}/manifest.webmanifest")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/manifest+json")
        m = r.json()
        # Same app identity as the stock manifest, so installs aren't duplicated.
        assert m["id"] == "/" and m["start_url"] == "/" and m["scope"] == "/"
        assert all(i["type"] == "image/png" for i in m["icons"])
        assert {i["purpose"] for i in m["icons"]} == {"any", "maskable"}
        assert {i["sizes"] for i in m["icons"]} == {"192x192", "512x512"}

    def test_icons_render_and_cache(self, client, admin_headers, db, club, logo):
        _enable(client, admin_headers)
        token = _token(db, club)
        m = client.get(f"/api/v1/app-icon/{token}/manifest.webmanifest").json()
        src = m["icons"][0]["src"]
        r = client.get(src)
        assert r.status_code == 200 and r.headers["content-type"] == "image/png"
        assert "immutable" in r.headers["cache-control"]
        assert _open(r.content).size == (192, 192)
        apple = client.get(f"/api/v1/app-icon/{token}/apple-touch-icon.png")
        assert _open(apple.content).size == (180, 180)
        assert "immutable" not in apple.headers["cache-control"]  # no/old version → short cache

    def test_unknown_kind_404(self, client, admin_headers, db, club):
        _enable(client, admin_headers)
        assert client.get(f"/api/v1/app-icon/{_token(db, club)}/huge.png").status_code == 404

    def test_disabled_falls_back_to_stock_icons(self, client, admin_headers, db, club):
        _enable(client, admin_headers)
        token = _token(db, club)
        client.patch("/api/v1/club/app-icon", json={"enabled": False}, headers=admin_headers)
        m = client.get(f"/api/v1/app-icon/{token}/manifest.webmanifest").json()
        assert m["icons"][0]["src"] == "/icons/icon-192.png"
        assert client.get(f"/api/v1/app-icon/{token}/icon-192.png").status_code == 404

    def test_version_changes_with_palette(self, client, admin_headers, db, club):
        _enable(client, admin_headers, variant="primary")
        token = _token(db, club)
        before = client.get(f"/api/v1/app-icon/{token}/manifest.webmanifest").json()["icons"][0]["src"]
        client.patch("/api/v1/club/settings", json={"primary_color": "#123456"}, headers=admin_headers)
        after = client.get(f"/api/v1/app-icon/{token}/manifest.webmanifest").json()["icons"][0]["src"]
        assert before != after

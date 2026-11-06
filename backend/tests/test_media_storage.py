"""Media storage backends, the /uploads serving route, and the S3 migration script."""
import importlib.util
import io
import sys
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from core.storage import LocalStorage, S3Storage, is_valid_key, key_from_url, set_storage
from models.club import ClubSettings
from models.comment import Comment
from core.security import create_access_token, get_password_hash
from models.user import User, UserRole

# backend/scripts/ is not a package (like gen_vapid.py), so load the script by path.
_spec = importlib.util.spec_from_file_location(
    "migrate_media_to_s3", Path(__file__).resolve().parents[1] / "scripts" / "migrate_media_to_s3.py")
mig = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = mig  # dataclasses look the module up by name
_spec.loader.exec_module(mig)


class FakeBody:
    def __init__(self, data: bytes):
        self._data = data

    def iter_chunks(self, size):
        yield self._data


class FakeS3:
    """Just enough of the boto3 S3 client for S3Storage."""

    def __init__(self):
        self.objects: dict[str, tuple[bytes, str]] = {}
        self.puts = 0

    @staticmethod
    def _missing(op):
        return ClientError({"Error": {"Code": "404" if op == "HeadObject" else "NoSuchKey"}}, op)

    def put_object(self, Bucket, Key, Body, ContentType):
        self.puts += 1
        self.objects[Key] = (bytes(Body), ContentType)

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise self._missing("HeadObject")
        return {"ContentLength": len(self.objects[Key][0])}

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise self._missing("GetObject")
        data, ct = self.objects[Key]
        return {"Body": FakeBody(data), "ContentLength": len(data), "ContentType": ct, "ETag": '"e"'}

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)


@pytest.fixture()
def s3_setup(tmp_path):
    local = LocalStorage(tmp_path / "volume")
    fake = FakeS3()
    storage = S3Storage(fake, "bucket", fallback=local)
    set_storage(storage)
    return storage, fake, local


@pytest.fixture()
def admin_headers(db, club):
    u = User(email="mediaadmin@test.de", name="Media Admin", hashed_password=get_password_hash("x"),
             role=UserRole.admin, club_id=club.id, is_active=True)
    db.add(u)
    db.commit()
    yield {"Authorization": f"Bearer {create_access_token({'sub': str(u.id)})}"}
    db.delete(u)
    db.commit()


PNG = b"\x89PNG\r\n\x1a\n"
PNG_URI = "data:image/png;base64,iVBORw0KGgo="


class TestKeys:
    @pytest.mark.parametrize("key", ["../etc/passwd", "media/../../x", "other/x.png", "media/", "media/.hidden",
                                     "media/a/b.png"])
    def test_rejects_unsafe_keys(self, key):
        assert not is_valid_key(key)

    def test_key_from_url(self):
        assert key_from_url("/uploads/logos/club_1_ab.png") == "logos/club_1_ab.png"
        assert key_from_url("https://x/uploads/logos/a.png") is None
        assert key_from_url(None) is None


class TestServeRoute:
    def test_serves_local_file(self, client, media_storage):
        media_storage.put("media/media_1_abc.jpg", b"jpgdata", "image/jpeg")
        resp = client.get("/uploads/media/media_1_abc.jpg")
        assert resp.status_code == 200
        assert resp.content == b"jpgdata"
        assert resp.headers["content-type"] == "image/jpeg"
        assert "immutable" in resp.headers["cache-control"]

    def test_missing_and_traversal_are_404(self, client):
        assert client.get("/uploads/media/nope.jpg").status_code == 404
        assert client.get("/uploads/../app/main.py").status_code == 404
        assert client.get("/uploads/secrets/x.txt").status_code == 404

    def test_s3_object_served(self, client, s3_setup):
        storage, fake, _ = s3_setup
        storage.put("logos/club_1_x.png", PNG, "image/png")
        resp = client.get("/uploads/logos/club_1_x.png")
        assert resp.status_code == 200
        assert resp.content == PNG

    def test_falls_back_to_volume_for_unmigrated_files(self, client, s3_setup):
        _, fake, local = s3_setup
        local.put("media/media_1_old.jpg", b"old", "image/jpeg")
        resp = client.get("/uploads/media/media_1_old.jpg")
        assert resp.status_code == 200
        assert resp.content == b"old"
        assert fake.objects == {}

    def test_head_request(self, client, media_storage):
        media_storage.put("media/media_1_h.jpg", b"12345", "image/jpeg")
        resp = client.head("/uploads/media/media_1_h.jpg")
        assert resp.status_code == 200
        assert resp.headers["content-length"] == "5"


class TestUploadsWithS3:
    def test_media_upload_goes_to_bucket(self, client, auth_headers, s3_setup):
        _, fake, local = s3_setup
        resp = client.post("/api/v1/uploads/media", headers=auth_headers,
                           files={"file": ("p.jpg", io.BytesIO(b"\xff\xd8\xff"), "image/jpeg")})
        assert resp.status_code == 200
        key = key_from_url(resp.json()["url"])
        assert fake.objects[key] == (b"\xff\xd8\xff", "image/jpeg")
        assert local.size(key) is None

    def test_logo_replace_deletes_old_object_and_volume_copy(self, client, admin_headers, db, club, s3_setup):
        _, fake, local = s3_setup
        local.put("logos/club_1_old.png", PNG, "image/png")
        db.add(ClubSettings(club_id=club.id, logo_url="/uploads/logos/club_1_old.png", extra={}))
        db.commit()
        resp = client.post("/api/v1/club/logo", headers=admin_headers,
                           files={"file": ("l.png", io.BytesIO(PNG), "image/png")})
        assert resp.status_code == 200
        assert key_from_url(resp.json()["logo_url"]) in fake.objects
        assert local.size("logos/club_1_old.png") is None

    def test_avatar_goes_to_bucket(self, client, auth_headers, db, user, s3_setup):
        _, fake, _ = s3_setup
        resp = client.patch("/api/v1/auth/avatar", json={"avatar": PNG_URI}, headers=auth_headers)
        assert resp.status_code == 200
        assert fake.objects[key_from_url(resp.json()["avatar"])][0] == PNG


class TestMigration:
    def test_copies_files_and_is_idempotent(self, s3_setup):
        storage, fake, local = s3_setup
        local.put("media/media_1_a.jpg", b"a", "image/jpeg")
        local.put("logos/club_1_b.svg", b"<svg/>", "image/svg+xml")

        r = mig.Report()
        mig.migrate_files(local, storage, r)
        assert r.copied == 2 and r.ok
        assert fake.objects["logos/club_1_b.svg"] == (b"<svg/>", "image/svg+xml")
        assert local.size("media/media_1_a.jpg") == 1  # volume untouched

        r2 = mig.Report()
        mig.migrate_files(local, storage, r2)
        assert r2.copied == 0 and r2.skipped == 2
        assert fake.puts == 2

    def test_dry_run_writes_nothing(self, db, user, s3_setup):
        storage, fake, local = s3_setup
        local.put("media/media_1_a.jpg", b"a", "image/jpeg")
        user.avatar = PNG_URI
        db.commit()
        r = mig.Report()
        mig.migrate_files(local, storage, r, dry_run=True)
        mig.migrate_avatars(db, storage, r, dry_run=True)
        assert r.copied == 1 and r.avatars_moved == 1
        assert fake.objects == {}
        db.refresh(user)
        assert user.avatar == PNG_URI

    def test_moves_avatar_keeps_legacy_copy(self, db, user, s3_setup):
        storage, fake, _ = s3_setup
        user.avatar = PNG_URI
        db.commit()
        r = mig.Report()
        mig.migrate_avatars(db, storage, r)
        db.refresh(user)
        assert r.avatars_moved == 1
        assert user.avatar.startswith(f"/uploads/avatars/avatar_{user.id}_")
        assert user.avatar_legacy == PNG_URI
        assert fake.objects[key_from_url(user.avatar)][0] == PNG

        # Re-run: nothing left to move
        r2 = mig.Report()
        mig.migrate_avatars(db, storage, r2)
        assert r2.avatars_moved == 0

    def test_read_back_mismatch_leaves_row_alone(self, db, user, s3_setup):
        storage, fake, _ = s3_setup
        user.avatar = PNG_URI
        db.commit()
        fake.put_object = lambda **kw: None  # upload silently lost
        r = mig.Report()
        mig.migrate_avatars(db, storage, r)
        db.refresh(user)
        assert user.avatar == PNG_URI and user.avatar_legacy is None
        assert not r.ok

    def test_invalid_avatar_is_reported_not_touched(self, db, user, s3_setup):
        storage, _, _ = s3_setup
        user.avatar = "data:text/plain;base64,aGk="
        db.commit()
        r = mig.Report()
        mig.migrate_avatars(db, storage, r)
        db.refresh(user)
        assert user.avatar == "data:text/plain;base64,aGk="
        assert r.errors

    def test_verify_purge_and_rollback(self, db, club, user, s3_setup):
        storage, fake, local = s3_setup
        user.avatar = PNG_URI
        db.add(ClubSettings(club_id=club.id, logo_url="/uploads/logos/club_1_l.png", extra={}))
        db.add(Comment(parent_type="highlight", parent_id=1, created_by=user.id,
                       text=None, media_url="/uploads/media/media_1_c.jpg"))
        db.commit()
        local.put("logos/club_1_l.png", PNG, "image/png")

        r = mig.Report()
        mig.verify(db, storage, r)
        assert not r.ok
        assert any("logos/club_1_l.png" in m for m in r.missing)
        assert any("still stored in the database" in m for m in r.missing)

        local.put("media/media_1_c.jpg", b"c", "image/jpeg")
        mig.migrate_files(local, storage, mig.Report())
        mig.migrate_avatars(db, storage, mig.Report())
        r = mig.Report()
        mig.verify(db, storage, r)
        assert r.ok, r.missing
        assert r.checked == 3  # logo, comment photo, migrated avatar

        # Rollback restores the data URI
        r = mig.Report()
        mig.rollback_avatars(db, r)
        db.refresh(user)
        assert r.avatars_restored == 1 and user.avatar == PNG_URI and user.avatar_legacy is None

        # Migrate again, then purge the legacy copy
        mig.migrate_avatars(db, storage, mig.Report())
        r = mig.Report()
        mig.purge_legacy_avatars(db, storage, r)
        db.refresh(user)
        assert r.legacy_purged == 1 and user.avatar_legacy is None

    def test_purge_keeps_legacy_when_object_missing(self, db, user, s3_setup):
        storage, fake, _ = s3_setup
        user.avatar = PNG_URI
        db.commit()
        mig.migrate_avatars(db, storage, mig.Report())
        fake.objects.clear()
        r = mig.Report()
        mig.purge_legacy_avatars(db, storage, r)
        db.refresh(user)
        assert user.avatar_legacy == PNG_URI
        assert not r.ok

    def test_new_avatar_clears_legacy(self, client, auth_headers, db, user, s3_setup):
        user.avatar = "/uploads/avatars/avatar_x.png"
        user.avatar_legacy = PNG_URI
        db.commit()
        client.patch("/api/v1/auth/avatar", json={"avatar": None}, headers=auth_headers)
        db.refresh(user)
        assert user.avatar is None and user.avatar_legacy is None


@pytest.fixture(autouse=True)
def _cleanup(db, club):
    yield
    db.query(Comment).delete()
    db.query(ClubSettings).filter(ClubSettings.club_id == club.id).delete()
    db.query(User).filter(User.club_id == club.id).update({User.avatar: None, User.avatar_legacy: None})
    db.commit()

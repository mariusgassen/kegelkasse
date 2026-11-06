"""
Move existing media into the S3 bucket (Garage or any S3-compatible store).

Run inside the app container from /app, after the MEDIA_S3_* variables are set and MEDIA_STORAGE=s3 is deployed:

    python scripts/migrate_media_to_s3.py              # copy files + avatars
    python scripts/migrate_media_to_s3.py --dry-run    # only report what would happen
    python scripts/migrate_media_to_s3.py --verify     # check every DB reference is in the bucket
    python scripts/migrate_media_to_s3.py --purge-legacy-avatars   # after --verify passes
    python scripts/migrate_media_to_s3.py --rollback-avatars       # undo the avatar step

Safe to interrupt and run again:
- Files on the uploads volume are copied under the same key; a key already in the bucket with the
  same size is skipped. The volume is never modified, and the app keeps serving from it for any key
  the bucket does not have yet.
- Avatars (base64 data URIs in ``user.avatar``) are written under a content-hash key, read back and
  compared before the row is switched to the ``/uploads/avatars/...`` URL. The original data URI is
  kept in ``user.avatar_legacy`` until ``--purge-legacy-avatars``. Each row is committed on its own.
"""
from __future__ import annotations

import argparse
import mimetypes
import os
import sys
from dataclasses import dataclass, field

# The app packages (``core``, ``models``) live in app/, next to this scripts/ folder.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app"))

from core.avatars import InvalidAvatar, avatar_key, decode_data_uri  # noqa: E402
from core.config import settings  # noqa: E402
from core.storage import LocalStorage, S3Storage, build_s3_client, key_from_url, local_storage, url_for_key  # noqa: E402


@dataclass
class Report:
    copied: int = 0
    skipped: int = 0
    avatars_moved: int = 0
    avatars_restored: int = 0
    legacy_purged: int = 0
    checked: int = 0
    missing: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors and not self.missing


def migrate_files(local: LocalStorage, s3: S3Storage, report: Report, dry_run: bool = False) -> None:
    for key in local.iter_keys():
        size = local.size(key)
        if s3.size(key) == size:
            report.skipped += 1
            continue
        if dry_run:
            print(f"would copy {key} ({size} bytes)")
            report.copied += 1
            continue
        data = local.read_bytes(key)
        s3.put(key, data, mimetypes.guess_type(key)[0] or "application/octet-stream")
        if s3.size(key) != len(data):
            report.errors.append(f"{key}: size mismatch after upload")
            continue
        report.copied += 1


def migrate_avatars(db, s3: S3Storage, report: Report, dry_run: bool = False) -> None:
    from models.user import User

    rows = db.query(User).filter(User.avatar.like("data:%")).order_by(User.id).all()
    for user in rows:
        try:
            data, content_type = decode_data_uri(user.avatar)
        except InvalidAvatar as exc:
            report.errors.append(f"user {user.id}: {exc} — left in the database")
            continue
        key = avatar_key(user.id, data, content_type)
        if dry_run:
            print(f"would move avatar of user {user.id} → {key} ({len(data)} bytes)")
            report.avatars_moved += 1
            continue
        s3.put(key, data, content_type)
        stored = s3.read_bytes(key)
        if stored != data:
            report.errors.append(f"user {user.id}: read-back mismatch for {key} — left in the database")
            continue
        user.avatar_legacy = user.avatar
        user.avatar = url_for_key(key)
        db.commit()
        report.avatars_moved += 1


def _referenced_keys(db) -> list[tuple[str, str]]:
    from models.club import ClubSettings
    from models.comment import Comment
    from models.committee import ClubAnnouncement
    from models.evening import EveningHighlight
    from models.user import User

    refs: list[tuple[str, str]] = []
    for label, col in (
        ("club logo", ClubSettings.logo_url),
        ("highlight", EveningHighlight.media_url),
        ("announcement", ClubAnnouncement.media_url),
        ("comment", Comment.media_url),
        ("avatar", User.avatar),
    ):
        for (url,) in db.query(col).filter(col.like("/uploads/%")).all():
            key = key_from_url(url)
            if key:
                refs.append((label, key))
    return refs


def verify(db, s3: S3Storage, report: Report) -> None:
    from models.user import User

    for label, key in _referenced_keys(db):
        report.checked += 1
        if s3.size(key) is None:
            report.missing.append(f"{label}: {key}")
    left = db.query(User).filter(User.avatar.like("data:%")).count()
    if left:
        report.missing.append(f"{left} avatar(s) still stored in the database")


def purge_legacy_avatars(db, s3: S3Storage, report: Report, dry_run: bool = False) -> None:
    from models.user import User

    for user in db.query(User).filter(User.avatar_legacy.isnot(None)).order_by(User.id).all():
        key = key_from_url(user.avatar)
        if key is None or s3.size(key) is None:
            report.missing.append(f"user {user.id}: avatar object missing — legacy copy kept")
            continue
        if not dry_run:
            user.avatar_legacy = None
            db.commit()
        report.legacy_purged += 1


def rollback_avatars(db, report: Report, dry_run: bool = False) -> None:
    from models.user import User

    for user in db.query(User).filter(User.avatar_legacy.isnot(None)).order_by(User.id).all():
        if not dry_run:
            user.avatar = user.avatar_legacy
            user.avatar_legacy = None
            db.commit()
        report.avatars_restored += 1


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--files-only", action="store_true", help="skip the avatar step")
    parser.add_argument("--verify", action="store_true", help="only check that every reference is in the bucket")
    parser.add_argument("--purge-legacy-avatars", action="store_true")
    parser.add_argument("--rollback-avatars", action="store_true")
    args = parser.parse_args(argv)

    if not settings.MEDIA_S3_BUCKET:
        print("MEDIA_S3_BUCKET is not set — configure the MEDIA_S3_* variables first.", file=sys.stderr)
        return 2

    from core.database import SessionLocal

    s3 = S3Storage(build_s3_client(), settings.MEDIA_S3_BUCKET)
    report = Report()
    db = SessionLocal()
    try:
        if args.rollback_avatars:
            rollback_avatars(db, report, args.dry_run)
        elif args.purge_legacy_avatars:
            purge_legacy_avatars(db, s3, report, args.dry_run)
        elif args.verify:
            verify(db, s3, report)
        else:
            migrate_files(local_storage(), s3, report, args.dry_run)
            if not args.files_only:
                if settings.MEDIA_STORAGE.lower() != "s3":
                    print("Skipping avatars: deploy MEDIA_STORAGE=s3 first, otherwise the new "
                          "/uploads/avatars URLs would not resolve.", file=sys.stderr)
                else:
                    migrate_avatars(db, s3, report, args.dry_run)
    finally:
        db.close()

    print(f"files copied: {report.copied}, already in bucket: {report.skipped}, "
          f"avatars moved: {report.avatars_moved}, avatars restored: {report.avatars_restored}, "
          f"legacy avatars purged: {report.legacy_purged}")
    for line in report.missing:
        print(f"MISSING  {line}")
    for line in report.errors:
        print(f"ERROR    {line}")
    if args.verify and report.ok:
        print(f"OK — all {report.checked} files referenced in the database are in the bucket.")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())

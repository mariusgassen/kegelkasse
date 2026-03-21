"""Database backup utilities — pg_dump to disk + optional S3 upload."""
import asyncio
import gzip
import logging
import os
import subprocess
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)


def _backup_dir() -> Path:
    from core.config import settings
    p = Path(settings.BACKUP_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def list_backups() -> list[dict]:
    d = _backup_dir()
    files = sorted(d.glob("*.sql.gz"), key=lambda f: f.stat().st_mtime, reverse=True)
    return [
        {
            "filename": f.name,
            "size_bytes": f.stat().st_size,
            "created_at": datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc).isoformat(),
        }
        for f in files
    ]


def get_backup_path(filename: str) -> Path | None:
    if not filename.endswith(".sql.gz") or "/" in filename or "\\" in filename:
        return None
    f = _backup_dir() / filename
    return f if f.exists() else None


def delete_backup(filename: str) -> bool:
    path = get_backup_path(filename)
    if not path:
        return False
    path.unlink()
    return True


def _rotate_backups(retain_days: int) -> None:
    cutoff = time.time() - (retain_days * 86400)
    for f in _backup_dir().glob("*.sql.gz"):
        if f.stat().st_mtime < cutoff:
            f.unlink()
            logger.info(f"Rotated old backup: {f.name}")


async def run_backup() -> dict:
    """Run pg_dump, save compressed backup to disk, upload to S3 if configured."""
    from core.config import settings

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"kegelkasse_{timestamp}.sql.gz"
    backup_path = _backup_dir() / filename

    parsed = urllib.parse.urlparse(settings.DATABASE_URL)
    host = parsed.hostname
    port = parsed.port or 5432
    db_user = parsed.username
    db_pass = parsed.password or ""
    db_name = parsed.path.lstrip("/")

    env = os.environ.copy()
    env["PGPASSWORD"] = db_pass

    logger.info(f"Starting backup: {filename}")

    def _dump() -> None:
        cmd = ["pg_dump", "-h", host, "-p", str(port), "-U", db_user, "-d", db_name, "--no-owner", "--no-acl"]
        with gzip.open(str(backup_path), "wb") as gz:
            proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            while True:
                chunk = proc.stdout.read(65536)
                if not chunk:
                    break
                gz.write(chunk)
            proc.wait()
        if proc.returncode != 0:
            backup_path.unlink(missing_ok=True)
            raise RuntimeError(f"pg_dump failed: {proc.stderr.read().decode()}")

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _dump)

    size = backup_path.stat().st_size
    logger.info(f"Backup saved: {backup_path} ({size} bytes)")

    _rotate_backups(settings.BACKUP_RETAIN_DAYS)

    s3_path = None
    if settings.S3_BUCKET:
        s3_path = await _upload_to_s3(backup_path, filename)

    return {
        "filename": filename,
        "size_bytes": size,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "s3_path": s3_path,
    }


async def _upload_to_s3(backup_path: Path, filename: str) -> str:
    from core.config import settings

    def _upload() -> str:
        import boto3
        kwargs: dict = dict(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_DEFAULT_REGION,
        )
        if settings.S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
        s3 = boto3.client("s3", **kwargs)
        key = f"{settings.S3_PREFIX}/{filename}"
        s3.upload_file(str(backup_path), settings.S3_BUCKET, key)
        return f"s3://{settings.S3_BUCKET}/{key}"

    loop = asyncio.get_event_loop()
    s3_path = await loop.run_in_executor(None, _upload)
    logger.info(f"Uploaded to S3: {s3_path}")
    return s3_path

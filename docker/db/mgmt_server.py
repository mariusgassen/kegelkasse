#!/usr/bin/env python3
"""
Minimal pgbackrest management HTTP server.
Listens on :8089 (internal Docker network only).
Runs pgbackrest commands as the 'postgres' user via gosu.
"""
import http.server
import json
import os
import re
import subprocess
import tarfile
import threading
import time
import urllib.parse

STANZA = "main"
PORT = 8089


def pgb(*args: str) -> subprocess.CompletedProcess:
    """Run a pgbackrest command as the postgres user."""
    return subprocess.run(
        ["gosu", "postgres", "pgbackrest", f"--stanza={STANZA}", *args],
        capture_output=True,
        text=True,
    )


def _extract_json(output: str) -> list:
    """
    Extract the JSON array from pgbackrest output.
    pgbackrest may emit log/warning lines before the JSON when env vars like
    PGBACKREST_MGMT_URL are present — we skip those and find the first '['.
    """
    idx = output.find("[")
    if idx >= 0:
        return json.loads(output[idx:])
    return []


def _ensure_stanza() -> bool:
    """Run stanza-create; return True on success."""
    r = pgb("stanza-create", "--log-level-stderr=info")
    if r.returncode != 0:
        print(f"pgbackrest stanza-create failed:\n{r.stderr.strip()}", flush=True)
    return r.returncode == 0


def _startup_stanza_init() -> None:
    """
    Background thread: retry stanza-create until it succeeds.
    Needed for existing volumes where initdb.d scripts never ran.
    """
    print("pgbackrest startup: waiting for PostgreSQL to accept stanza-create...", flush=True)
    for attempt in range(60):
        if _ensure_stanza():
            print(f"pgbackrest stanza initialised (attempt {attempt + 1}).", flush=True)
            return
        time.sleep(5)
    print("WARNING: pgbackrest stanza-create did not succeed after 60 attempts.", flush=True)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # suppress access log noise

    def _json(self, data: object, status: int = 200) -> None:
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/info":
            r = pgb("info", "--output=json")
            if r.returncode == 0:
                self._json(_extract_json(r.stdout))
            else:
                self._json({"error": r.stderr.strip()}, 500)
        elif parsed.path == "/health":
            self._json({"ok": True})
        elif parsed.path == "/config":
            repo_type = os.environ.get("PGBACKREST_REPO1_TYPE", "posix")
            info: dict = {"repo_type": repo_type}
            if repo_type == "s3":
                info["s3_bucket"] = os.environ.get("PGBACKREST_REPO1_S3_BUCKET", "")
                info["s3_region"] = os.environ.get("PGBACKREST_REPO1_S3_REGION", "")
                info["s3_endpoint"] = os.environ.get("PGBACKREST_REPO1_S3_ENDPOINT", "")
            self._json(info)
        elif re.match(r"^/backup/[\w-]+/download$", parsed.path):
            label = parsed.path.split("/")[2]
            backup_dir = f"/pgbackrest/backup/{STANZA}/{label}"
            if not os.path.isdir(backup_dir):
                self._json({"error": "backup not found"}, 404)
                return
            filename = f"{STANZA}-{label}.tar.gz"
            self.send_response(200)
            self.send_header("Content-Type", "application/gzip")
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
            self.end_headers()
            with tarfile.open(fileobj=self.wfile, mode="w|gz") as tar:
                tar.add(backup_dir, arcname=label)
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/stanza-create":
            r = pgb("stanza-create", "--log-level-stderr=info")
            if r.returncode == 0:
                self._json({"ok": True})
            else:
                self._json({"error": r.stderr.strip()}, 500)
        elif parsed.path == "/backup":
            params = urllib.parse.parse_qs(parsed.query)
            btype = params.get("type", ["full"])[0]
            if btype not in ("full", "diff", "incr"):
                btype = "full"
            # Auto-create stanza if it has not been initialised yet (idempotent).
            sc = pgb("stanza-create", "--log-level-stderr=info")
            if sc.returncode != 0:
                self._json({"error": f"stanza-create failed: {sc.stderr.strip()}"}, 500)
                return
            r = pgb("backup", f"--type={btype}")
            if r.returncode == 0:
                info_r = pgb("info", "--output=json")
                info = _extract_json(info_r.stdout) if info_r.returncode == 0 else []
                self._json({"ok": True, "info": info})
            else:
                self._json({"error": r.stderr.strip()}, 500)
        elif parsed.path == "/expire":
            r = pgb("expire")
            if r.returncode == 0:
                self._json({"ok": True})
            else:
                self._json({"error": r.stderr.strip()}, 500)
        else:
            self._json({"error": "not found"}, 404)

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if re.match(r"^/backup/[\w-]+$", parsed.path):
            label = parsed.path.split("/")[2]
            r = pgb("expire", f"--set={label}")
            if r.returncode == 0:
                self._json({"ok": True})
            else:
                self._json({"error": r.stderr.strip()}, 500)
        else:
            self._json({"error": "not found"}, 404)


if __name__ == "__main__":
    # Try to initialise the pgbackrest stanza in the background so WAL
    # archiving works as soon as PostgreSQL is ready, even on existing volumes.
    threading.Thread(target=_startup_stanza_init, daemon=True).start()

    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"pgbackrest management server listening on :{PORT}", flush=True)
    server.serve_forever()

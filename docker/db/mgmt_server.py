#!/usr/bin/env python3
"""
Minimal pgbackrest management HTTP server.
Listens on :8089 (internal Docker network only).
Runs pgbackrest commands as the 'postgres' user via gosu.
"""
import http.server
import json
import subprocess
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
                self._json(json.loads(r.stdout))
            else:
                self._json({"error": r.stderr.strip()}, 500)
        elif parsed.path == "/health":
            self._json({"ok": True})
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/backup":
            params = urllib.parse.parse_qs(parsed.query)
            btype = params.get("type", ["full"])[0]
            if btype not in ("full", "diff", "incr"):
                btype = "full"
            r = pgb("backup", f"--type={btype}")
            if r.returncode == 0:
                info_r = pgb("info", "--output=json")
                info = json.loads(info_r.stdout) if info_r.returncode == 0 else []
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


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"pgbackrest management server listening on :{PORT}", flush=True)
    server.serve_forever()

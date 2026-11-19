"""MCP server for managing the Kegelkasse community & official roadmap.

Exposes two modes from the same FastMCP tool definitions:
1. Remote Streamable-HTTP endpoint mounted at ``/mcp`` in FastAPI (``RoadmapMcpASGI``),
   authenticated via ``Authorization: Bearer <MCP_API_TOKEN or user JWT>``.
2. Direct local-DB ``stdio`` server when invoked via ``python -m app.mcp_roadmap``.

For a standalone ``stdio`` client that connects over HTTPS to a remote Kegelkasse
deployment (for ``.mcp.json`` / Claude Code / Antigravity / Cursor), see
``app/mcp_roadmap_stdio.py``.
"""
from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
import os
import secrets
from typing import Any, AsyncIterator, Iterator, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from mcp.server.fastmcp import FastMCP
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.server.transport_security import TransportSecuritySettings
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse
from starlette.types import Receive, Scope, Send

from api.v1 import comments as comments_api
from api.v1 import roadmap as roadmap_api
from core.config import settings
from core.database import SessionLocal, get_db
from core.security import decode_token
from models.user import User

_mcp_db_var: ContextVar[Optional[Session]] = ContextVar("_mcp_db", default=None)
_mcp_user_var: ContextVar[Optional[User]] = ContextVar("_mcp_user", default=None)
_session_manager: Optional[StreamableHTTPSessionManager] = None

roadmap_mcp = FastMCP(
    "Kegelkasse Roadmap",
    instructions=(
        "Verwalte die Kegelkasse Roadmap (Ideen, geplante Features, laufende Arbeit, "
        "abgeschlossene Meilensteine, Duplikate und Kommentare). "
        "Verfuegbare Statuswerte: idea, planned, in_progress, completed, rejected, duplicate. "
        "Verfuegbare Kategorien (Beispiele): feature, improvement, design, evening, kasse, admin."
    ),
    streamable_http_path="/",
    stateless_http=True,
    json_response=True,
    # Kegelkasse runs behind a reverse proxy (Coolify/Traefik) on custom domains;
    # auth is enforced by Bearer token / JWT in RoadmapMcpASGI.
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


@asynccontextmanager
async def mcp_session_lifespan() -> AsyncIterator[None]:
    """Create and run a fresh StreamableHTTPSessionManager for the ASGI lifespan."""
    global _session_manager
    mgr = StreamableHTTPSessionManager(
        app=roadmap_mcp._mcp_server,
        json_response=True,
        stateless=True,
        security_settings=roadmap_mcp.settings.transport_security,
    )
    _session_manager = mgr
    try:
        async with mgr.run():
            yield
    finally:
        _session_manager = None


def _resolve_superadmin_user(db: Session) -> Optional[User]:
    """Find the active superadmin user used when authenticating with MCP_API_TOKEN."""
    preferred_email = settings.FIRST_SUPERADMIN_EMAIL.strip().lower()
    if preferred_email:
        u = db.query(User).filter(User.email == preferred_email, User.is_active == True).first()  # noqa: E712
        if u and u.is_superadmin:
            return u
    for u in db.query(User).filter(User.is_active == True).order_by(User.id).all():  # noqa: E712
        if u.is_superadmin:
            return u
    return None


def _resolve_stdio_user(db: Session) -> User:
    """Resolve the acting user for direct local-DB stdio mode."""
    email = os.environ.get("KEGELKASSE_USER_EMAIL", "").strip().lower()
    if email:
        u = db.query(User).filter(User.email == email, User.is_active == True).first()  # noqa: E712
        if not u:
            raise RuntimeError(f"Active user not found for KEGELKASSE_USER_EMAIL={email!r}")
        return u
    u = _resolve_superadmin_user(db)
    if not u:
        raise RuntimeError("No active superadmin user found in database")
    return u


@contextmanager
def _tool_context() -> Iterator[tuple[Session, User]]:
    """Return the active (db, user) from HTTP request context or open a local stdio session."""
    db = _mcp_db_var.get()
    user = _mcp_user_var.get()
    if db is not None and user is not None:
        yield db, user
        return

    local_db = SessionLocal()
    try:
        local_user = _resolve_stdio_user(local_db)
        yield local_db, local_user
    finally:
        local_db.close()


def _coerce_tags(tags: Optional[list[str] | str]) -> Optional[str]:
    if tags is None:
        return None
    if isinstance(tags, list):
        return ", ".join(str(t).strip() for t in tags if str(t).strip())
    return tags


def _handle_http_exc(exc: HTTPException) -> ValueError:
    return ValueError(f"{exc.status_code}: {exc.detail}")


@roadmap_mcp.tool()
def roadmap_summary() -> dict[str, Any]:
    """Return counts by status/category, pinned items, and top-voted open roadmap items."""
    with _tool_context() as (db, user):
        all_items: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = roadmap_api.query_roadmap_items(
                db, user, limit=roadmap_api.MAX_PAGE, offset=offset
            )
            all_items.extend(page)
            if len(page) < roadmap_api.MAX_PAGE:
                break
            offset += roadmap_api.MAX_PAGE

    by_status: dict[str, int] = {}
    by_category: dict[str, int] = {}
    official_count = 0
    pinned_items: list[dict[str, Any]] = []
    open_items: list[dict[str, Any]] = []

    for it in all_items:
        st = it["status"]
        cat = it["category"]
        by_status[st] = by_status.get(st, 0) + 1
        by_category[cat] = by_category.get(cat, 0) + 1
        if it["is_official"]:
            official_count += 1
        if it["is_pinned"]:
            pinned_items.append({
                "id": it["id"],
                "title": it["title"],
                "status": st,
                "target_version": it["target_version"],
                "vote_count": it["vote_count"],
            })
        if st in ("idea", "planned", "in_progress"):
            open_items.append(it)

    open_items.sort(key=lambda x: (-x["vote_count"], -x["id"]))
    top_voted_open = [
        {
            "id": it["id"],
            "title": it["title"],
            "status": it["status"],
            "category": it["category"],
            "vote_count": it["vote_count"],
            "is_official": it["is_official"],
        }
        for it in open_items[:10]
    ]

    return {
        "total": len(all_items),
        "official_count": official_count,
        "community_count": len(all_items) - official_count,
        "by_status": by_status,
        "by_category": by_category,
        "pinned_items": pinned_items,
        "top_voted_open": top_voted_open,
    }


@roadmap_mcp.tool()
def list_roadmap_items(
    status: Optional[str] = None,
    category: Optional[str] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    is_official: Optional[bool] = None,
    is_pinned: Optional[bool] = None,
    target_version: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    """List roadmap items with optional filters and full-text substring search.

    status: idea | planned | in_progress | completed | rejected | duplicate
    category: feature | improvement | design | evening | kasse | admin (or custom)
    """
    if status is not None and status not in roadmap_api.ALLOWED_STATUSES:
        raise ValueError(f"400: Invalid status {status!r}. Allowed: {sorted(roadmap_api.ALLOWED_STATUSES)}")
    clamped_limit = max(1, min(limit, roadmap_api.MAX_PAGE))
    clamped_offset = max(0, offset)
    with _tool_context() as (db, user):
        items = roadmap_api.query_roadmap_items(
            db,
            user,
            status_filter=status,
            category_filter=category,
            tag_filter=tag,
            search=search,
            is_official=is_official,
            is_pinned=is_pinned,
            target_version=target_version,
            limit=clamped_limit,
            offset=clamped_offset,
        )
    return {"items": items, "count": len(items), "offset": clamped_offset, "limit": clamped_limit}


@roadmap_mcp.tool()
def get_roadmap_item(item_id: int, include_comments: bool = True) -> dict[str, Any]:
    """Get full details for a roadmap item by ID, optionally including its comments."""
    with _tool_context() as (db, user):
        try:
            item = roadmap_api.get_roadmap_item(item_id, db=db, user=user)
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc

        if include_comments:
            try:
                item["comments"] = comments_api.list_comments("roadmap", item_id, db=db, user=user)
            except HTTPException:
                item["comments"] = []
                item["comments_restricted"] = True
    return item


@roadmap_mcp.tool()
def create_roadmap_item(
    title: str,
    description: Optional[str] = None,
    category: str = "feature",
    tags: Optional[list[str] | str] = None,
    status: str = "idea",
    is_official: bool = False,
    is_pinned: bool = False,
    target_version: Optional[str] = None,
    admin_notes: Optional[str] = None,
) -> dict[str, Any]:
    """Create a new roadmap item (idea or official milestone).

    Superadmins can set is_official=True, status, is_pinned, target_version, and admin_notes.
    Club admins can set status, is_pinned, target_version, and admin_notes on their club's items.
    """
    payload = roadmap_api.RoadmapItemCreate(
        title=title,
        description=description,
        category=category,
        tags=_coerce_tags(tags),
        status=status,
        is_official=is_official,
        is_pinned=is_pinned,
        target_version=target_version,
        admin_notes=admin_notes,
    )
    with _tool_context() as (db, user):
        try:
            return roadmap_api.create_roadmap_item(payload, db=db, user=user)
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc


@roadmap_mcp.tool()
def update_roadmap_item(
    item_id: int,
    title: Optional[str] = None,
    description: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    tags: Optional[list[str] | str] = None,
    is_pinned: Optional[bool] = None,
    duplicate_of_id: Optional[int] = None,
    admin_notes: Optional[str] = None,
    target_version: Optional[str] = None,
    is_official: Optional[bool] = None,
) -> dict[str, Any]:
    """Update any editable fields on a roadmap item (pass duplicate_of_id=0 to unlink a duplicate)."""
    payload = roadmap_api.RoadmapItemUpdate(
        title=title,
        description=description,
        status=status,
        category=category,
        tags=_coerce_tags(tags),
        is_pinned=is_pinned,
        duplicate_of_id=duplicate_of_id,
        admin_notes=admin_notes,
        target_version=target_version,
        is_official=is_official,
    )
    with _tool_context() as (db, user):
        try:
            return roadmap_api.update_roadmap_item(item_id, payload, db=db, user=user)
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc


@roadmap_mcp.tool()
def move_roadmap_status(
    item_id: int,
    status: str,
    target_version: Optional[str] = None,
    admin_notes: Optional[str] = None,
    duplicate_of_id: Optional[int] = None,
) -> dict[str, Any]:
    """Move a roadmap item to another status (idea, planned, in_progress, completed, rejected, duplicate)."""
    if status not in roadmap_api.ALLOWED_STATUSES:
        raise ValueError(f"400: Invalid status {status!r}. Allowed: {sorted(roadmap_api.ALLOWED_STATUSES)}")
    payload = roadmap_api.RoadmapItemUpdate(
        status=status,
        target_version=target_version,
        admin_notes=admin_notes,
        duplicate_of_id=duplicate_of_id,
    )
    with _tool_context() as (db, user):
        try:
            return roadmap_api.update_roadmap_item(item_id, payload, db=db, user=user)
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc


@roadmap_mcp.tool()
def delete_roadmap_item(item_id: int) -> dict[str, Any]:
    """Delete a roadmap item together with its votes, comments, and reactions."""
    with _tool_context() as (db, user):
        try:
            return roadmap_api.delete_roadmap_item(item_id, db=db, user=user)
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc


@roadmap_mcp.tool()
def vote_roadmap_item(item_id: int) -> dict[str, Any]:
    """Toggle the acting user's upvote on a roadmap item."""
    with _tool_context() as (db, user):
        try:
            return roadmap_api.toggle_vote(item_id, db=db, user=user)
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc


@roadmap_mcp.tool()
def list_roadmap_comments(item_id: int) -> dict[str, Any]:
    """List comments and nested replies on a roadmap item."""
    with _tool_context() as (db, user):
        if not user.club_id and not user.is_superadmin:
            raise ValueError("403: No club assigned")
        try:
            comments = comments_api.list_comments("roadmap", item_id, db=db, user=user)
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc
    return {"item_id": item_id, "comments": comments, "count": len(comments)}


@roadmap_mcp.tool()
def add_roadmap_comment(
    item_id: int,
    text: str,
    parent_comment_id: Optional[int] = None,
) -> dict[str, Any]:
    """Post a comment (or reply when parent_comment_id is set) on a roadmap item."""
    with _tool_context() as (db, user):
        if not user.club_id and not user.is_superadmin:
            raise ValueError("403: No club assigned")
        try:
            return comments_api.create_comment(
                "roadmap",
                item_id,
                comments_api.CommentCreate(text=text, parent_comment_id=parent_comment_id),
                BackgroundTasks(),
                db=db,
                user=user,
            )
        except HTTPException as exc:
            raise _handle_http_exc(exc) from exc


class RoadmapMcpASGI:
    """ASGI adapter that authenticates Bearer requests and injects DB/user context into FastMCP."""

    def __init__(self, fastapi_app: FastAPI) -> None:
        self.fastapi_app = fastapi_app

    @staticmethod
    def _extract_bearer(scope: Scope) -> Optional[str]:
        for name, value in scope.get("headers", ()):
            if name.lower() == b"authorization":
                raw = value.decode("latin-1").strip()
                if raw.lower().startswith("bearer "):
                    return raw[7:].strip() or None
        return None

    @staticmethod
    async def _send_json_error(
        scope: Scope,
        receive: Receive,
        send: Send,
        status_code: int,
        detail: str,
        *,
        bearer_challenge: bool = False,
    ) -> None:
        headers = {"WWW-Authenticate": "Bearer"} if bearer_challenge else {}
        resp = JSONResponse({"detail": detail}, status_code=status_code, headers=headers)
        await resp(scope, receive, send)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return

        token = self._extract_bearer(scope)
        if not token:
            await self._send_json_error(scope, receive, send, 401, "Missing Bearer token", bearer_challenge=True)
            return

        db_dep = self.fastapi_app.dependency_overrides.get(get_db, get_db)
        db_gen = db_dep()
        db: Session = next(db_gen)
        try:
            user: Optional[User] = None
            configured_mcp_token = settings.MCP_API_TOKEN.strip()
            if configured_mcp_token and secrets.compare_digest(token, configured_mcp_token):
                user = _resolve_superadmin_user(db)
                if not user:
                    await self._send_json_error(
                        scope, receive, send, 503, "No active superadmin user available for MCP_API_TOKEN"
                    )
                    return
            else:
                payload = decode_token(token)
                if not payload:
                    await self._send_json_error(scope, receive, send, 401, "Invalid token", bearer_challenge=True)
                    return
                try:
                    user_id = int(payload.get("sub"))
                except (TypeError, ValueError):
                    await self._send_json_error(scope, receive, send, 401, "Invalid token", bearer_challenge=True)
                    return
                user = db.query(User).filter(User.id == user_id, User.is_active == True).first()  # noqa: E712
                if not user:
                    await self._send_json_error(scope, receive, send, 401, "User not found", bearer_challenge=True)
                    return

            mgr = _session_manager
            if mgr is None:
                await self._send_json_error(scope, receive, send, 503, "MCP session manager is not running")
                return

            db_tok = _mcp_db_var.set(db)
            user_tok = _mcp_user_var.set(user)
            try:
                await mgr.handle_request(scope, receive, send)
            finally:
                _mcp_user_var.reset(user_tok)
                _mcp_db_var.reset(db_tok)
        finally:
            try:
                next(db_gen)
            except StopIteration:
                pass
            except Exception:
                db_gen.close()


if __name__ == "__main__":
    roadmap_mcp.run(transport="stdio")

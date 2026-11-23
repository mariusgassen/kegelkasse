"""Tests for the Kegelkasse Roadmap MCP server (/mcp Streamable HTTP & stdio bridge)."""
import json

import httpx
import pytest
from sqlalchemy.orm import Session

from api.v1 import roadmap as roadmap_api
from core.config import settings
from core.database import get_db
from core.security import create_access_token, get_password_hash
from main import app
from mcp_roadmap import mcp_session_lifespan
from mcp_roadmap_stdio import KegelkasseConfig, RemoteMcpBridge
from models.club import Club
from models.comment import Comment
from models.roadmap import RoadmapItem, RoadmapVote
from models.user import RefreshToken, User, UserRole


MCP_HEADERS = {
    "Accept": "application/json, text/event-stream",
    "Content-Type": "application/json",
}


def _mcp_rpc(client, path: str, method: str, params: dict | None = None, *, headers: dict | None = None, req_id: int = 1):
    body = {"jsonrpc": "2.0", "id": req_id, "method": method}
    if params is not None:
        body["params"] = params
    return client.post(path, json=body, headers={**MCP_HEADERS, **(headers or {})})


def _init_session(client, headers: dict, path: str = "/mcp"):
    r = _mcp_rpc(
        client,
        path,
        "initialize",
        {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "pytest", "version": "1.0"},
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _call_tool(client, headers: dict, name: str, arguments: dict | None = None, path: str = "/mcp") -> dict:
    r = _mcp_rpc(
        client,
        path,
        "tools/call",
        {"name": name, "arguments": arguments or {}},
        headers=headers,
        req_id=2,
    )
    assert r.status_code == 200, r.text
    payload = r.json()
    assert "result" in payload, payload
    return payload["result"]


def _parse_tool_json(result: dict) -> dict:
    assert result.get("isError") is not True, result
    if result.get("structuredContent") is not None:
        return result["structuredContent"]
    return json.loads(result["content"][0]["text"])


@pytest.fixture(autouse=True)
def cleanup(db: Session, club: Club):
    roadmap_api._create_limiter.reset()
    yield
    db.rollback()
    db.query(Comment).filter(Comment.parent_type == "roadmap").delete(synchronize_session=False)
    item_ids = [
        i.id
        for i in db.query(RoadmapItem).filter(
            (RoadmapItem.club_id == club.id) | (RoadmapItem.club_id.is_(None))
        ).all()
    ]
    if item_ids:
        db.query(RoadmapVote).filter(RoadmapVote.item_id.in_(item_ids)).delete(synchronize_session=False)
        db.query(RoadmapItem).filter(RoadmapItem.id.in_(item_ids)).delete(synchronize_session=False)
    for email in ("mcp_admin@test.de", "mcp_super@test.de"):
        u = db.query(User).filter(User.email == email).first()
        if u:
            db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete(synchronize_session=False)
            db.delete(u)
    db.commit()


@pytest.fixture()
def admin(db: Session, club: Club) -> User:
    u = User(
        email="mcp_admin@test.de",
        name="MCP Club Admin",
        hashed_password=get_password_hash("secret123"),
        role=UserRole.admin,
        club_id=club.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def superadmin(db: Session) -> User:
    u = User(
        email="mcp_super@test.de",
        name="MCP Superadmin",
        hashed_password=get_password_hash("supersecret"),
        role=UserRole.superadmin,
        club_id=None,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def test_mcp_auth_rejects_missing_and_invalid_tokens(client):
    r_missing = _mcp_rpc(client, "/mcp", "initialize")
    assert r_missing.status_code == 401
    assert "Bearer" in r_missing.headers.get("www-authenticate", "")

    r_bad = _mcp_rpc(client, "/mcp", "initialize", headers={"Authorization": "Bearer not-a-valid-token"})
    assert r_bad.status_code == 401


def test_mcp_api_token_requires_active_superadmin_and_acts_as_superadmin(client, superadmin, monkeypatch):
    monkeypatch.setattr(settings, "MCP_API_TOKEN", "mcp-secret-token-123")
    headers = {"Authorization": "Bearer mcp-secret-token-123"}

    _init_session(client, headers, path="/mcp")
    _init_session(client, headers, path="/mcp/")

    r_list = _mcp_rpc(client, "/mcp", "tools/list", headers=headers, req_id=10)
    assert r_list.status_code == 200
    tool_names = {t["name"] for t in r_list.json()["result"]["tools"]}
    assert tool_names == {
        "roadmap_summary",
        "list_roadmap_items",
        "get_roadmap_item",
        "create_roadmap_item",
        "update_roadmap_item",
        "move_roadmap_status",
        "delete_roadmap_item",
        "vote_roadmap_item",
        "list_roadmap_comments",
        "add_roadmap_comment",
    }

    # Verify 503 when no active superadmin exists for MCP_API_TOKEN
    from sqlalchemy.orm import object_session
    sess = object_session(superadmin)
    active_supers = [u for u in sess.query(User).filter(User.is_active == True).all() if u.is_superadmin]
    for u in active_supers:
        u.is_active = False
    sess.commit()
    try:
        r_no_super = _mcp_rpc(client, "/mcp", "tools/list", headers=headers, req_id=11)
        assert r_no_super.status_code == 503
    finally:
        for u in active_supers:
            u.is_active = True
        sess.commit()


def test_mcp_full_roadmap_lifecycle(client, user, superadmin, monkeypatch):
    monkeypatch.setattr(settings, "MCP_API_TOKEN", "mcp-lifecycle-token")
    super_headers = {"Authorization": "Bearer mcp-lifecycle-token"}
    member_token = create_access_token({"sub": str(user.id)})
    member_headers = {"Authorization": f"Bearer {member_token}"}

    _init_session(client, super_headers)

    # 1. Create official milestone with tags list
    created_res = _call_tool(
        client,
        super_headers,
        "create_roadmap_item",
        {
            "title": "Koenigs-Tippspiel",
            "description": "Vor dem Eroeffnungsspiel tippen",
            "category": "evening",
            "tags": ["tippspiel", "wrapped"],
            "status": "idea",
            "is_official": True,
            "is_pinned": True,
            "target_version": "2.1",
            "admin_notes": "Aus docs/roadmap.md uebernommen",
        },
    )
    created = _parse_tool_json(created_res)
    assert created["title"] == "Koenigs-Tippspiel"
    assert created["is_official"] is True
    assert created["is_pinned"] is True
    assert created["tags"] == ["tippspiel", "wrapped"]
    item_id = created["id"]

    # 2. Member creates a community idea via JWT
    dup_res = _call_tool(
        client,
        member_headers,
        "create_roadmap_item",
        {"title": "Koenig tippen vor Spielbeginn", "category": "evening"},
    )
    dup = _parse_tool_json(dup_res)
    dup_id = dup["id"]
    assert dup["is_official"] is False

    # 3. Member cannot move status or create official items via MCP
    err_move = _call_tool(
        client,
        member_headers,
        "move_roadmap_status",
        {"item_id": dup_id, "status": "planned"},
    )
    assert err_move["isError"] is True
    assert "403" in err_move["content"][0]["text"]

    err_official = _call_tool(
        client,
        member_headers,
        "create_roadmap_item",
        {"title": "Unbefugt", "is_official": True},
    )
    assert err_official["isError"] is True
    assert "403" in err_official["content"][0]["text"]

    # 4. Superadmin moves status through lifecycle and links duplicate
    moved = _parse_tool_json(
        _call_tool(
            client,
            super_headers,
            "move_roadmap_status",
            {"item_id": item_id, "status": "in_progress", "admin_notes": "Jetzt in Arbeit"},
        )
    )
    assert moved["status"] == "in_progress"
    assert moved["admin_notes"] == "Jetzt in Arbeit"

    linked = _parse_tool_json(
        _call_tool(
            client,
            super_headers,
            "update_roadmap_item",
            {"item_id": dup_id, "duplicate_of_id": item_id},
        )
    )
    assert linked["status"] == "duplicate"
    assert linked["duplicate_of_id"] == item_id

    # 5. Member votes on main item (auto-voted on dup already; main goes to 2)
    voted = _parse_tool_json(_call_tool(client, member_headers, "vote_roadmap_item", {"item_id": item_id}))
    assert voted["has_voted"] is True
    assert voted["vote_count"] == 2

    # 6. Comments: add top-level comment and reply, then list and fetch via get_roadmap_item
    c1 = _parse_tool_json(
        _call_tool(client, member_headers, "add_roadmap_comment", {"item_id": item_id, "text": "Super Feature!"})
    )
    _parse_tool_json(
        _call_tool(
            client,
            super_headers,
            "add_roadmap_comment",
            {"item_id": item_id, "text": "Danke, ist in Arbeit!", "parent_comment_id": c1["id"]},
        )
    )
    comments_res = _parse_tool_json(_call_tool(client, super_headers, "list_roadmap_comments", {"item_id": item_id}))
    assert comments_res["count"] == 1
    assert len(comments_res["comments"][0]["replies"]) == 1

    fetched = _parse_tool_json(_call_tool(client, super_headers, "get_roadmap_item", {"item_id": item_id}))
    assert fetched["comment_count"] == 2
    assert len(fetched["comments"]) == 1

    # 7. Search and summary
    listed = _parse_tool_json(
        _call_tool(
            client,
            super_headers,
            "list_roadmap_items",
            {"search": "tippspiel", "status": "in_progress", "is_official": True},
        )
    )
    assert listed["count"] == 1
    assert listed["items"][0]["id"] == item_id

    summary = _parse_tool_json(_call_tool(client, super_headers, "roadmap_summary"))
    assert summary["total"] >= 2
    assert summary["by_status"]["in_progress"] >= 1
    assert summary["official_count"] >= 1

    # 8. Delete duplicate item
    deleted = _parse_tool_json(_call_tool(client, super_headers, "delete_roadmap_item", {"item_id": dup_id}))
    assert deleted == {"ok": True, "id": dup_id}


async def test_stdio_bridge_connects_and_refreshes_jwt(db: Session, superadmin, monkeypatch):
    """Test the stdio bridge end-to-end against the FastAPI ASGI app, including 401 -> refresh."""
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        # 1. Static MCP_API_TOKEN mode
        monkeypatch.setattr(settings, "MCP_API_TOKEN", "bridge-mcp-token")
        async with mcp_session_lifespan():
            transport = httpx.ASGITransport(app=app)
            bridge_token = RemoteMcpBridge(
                KegelkasseConfig(base_url="http://testserver", token="bridge-mcp-token"),
                http_client_factory=lambda auth: httpx.AsyncClient(
                    transport=transport, base_url="http://testserver", auth=auth
                ),
            )
            tools = await bridge_token.list_tools()
            assert any(t.name == "move_roadmap_status" for t in tools)

            res = await bridge_token.call_tool(
                "create_roadmap_item",
                {"title": "Via Stdio Bridge", "status": "planned", "is_official": True},
            )
            data = res.structured_content or json.loads(res.content[0].text)
            assert data["title"] == "Via Stdio Bridge"
            assert data["status"] == "planned"
            assert data["is_official"] is True

            # 2. Email + password mode with expired access token -> automatic refresh
            bridge_creds = RemoteMcpBridge(
                KegelkasseConfig(
                    base_url="http://testserver",
                    email=superadmin.email,
                    password="supersecret",
                ),
                http_client_factory=lambda auth: httpx.AsyncClient(
                    transport=transport, base_url="http://testserver", auth=auth
                ),
                auth_client_factory=lambda: httpx.AsyncClient(
                    transport=transport, base_url="http://testserver"
                ),
            )
            # Perform initial login, then overwrite access_token with an invalid one to force 401 -> refresh
            first_token = await bridge_creds.auth.ensure_token()
            assert first_token
            assert bridge_creds.auth._refresh_token
            bridge_creds.auth._access_token = "expired.jwt.token"

            list_res = await bridge_creds.call_tool("list_roadmap_items", {"search": "Stdio Bridge"})
            listed = list_res.structured_content or json.loads(list_res.content[0].text)
            assert listed["count"] == 1
            assert bridge_creds.auth._access_token != "expired.jwt.token"
    finally:
        app.dependency_overrides.clear()

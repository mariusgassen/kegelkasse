# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "mcp>=2.3,<3.0",
#   "httpx>=0.28",
# ]
# ///
"""Local stdio MCP wrapper for a remote Kegelkasse /mcp server.

Forwards MCP tool discovery and tool calls over Streamable HTTP to a running
Kegelkasse instance (`KEGELKASSE_URL`), authenticating with either:
  - `KEGELKASSE_MCP_TOKEN` or `KEGELKASSE_TOKEN` (static MCP token or JWT), or
  - `KEGELKASSE_EMAIL` + `KEGELKASSE_PASSWORD` (auto-login & refresh via /api/v1/auth).

Usage:
  uv run backend/app/mcp_roadmap_stdio.py
  # or inside backend/:
  poetry run python -m app.mcp_roadmap_stdio
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass, field
import os
from typing import Any, Optional

import httpx
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from mcp.server.lowlevel import NotificationOptions, Server
from mcp.server.context import ServerRequestContext
from mcp.server.stdio import stdio_server
import mcp.types as types


@dataclass
class KegelkasseConfig:
    base_url: str
    token: str = ""
    email: str = ""
    password: str = ""
    timeout: float = 30.0

    @classmethod
    def from_env(cls) -> "KegelkasseConfig":
        raw_url = os.environ.get("KEGELKASSE_URL", "http://localhost:8000").strip().rstrip("/")
        if raw_url.endswith("/mcp"):
            raw_url = raw_url[:-4]
        token = (
            os.environ.get("KEGELKASSE_MCP_TOKEN", "").strip()
            or os.environ.get("KEGELKASSE_TOKEN", "").strip()
        )
        email = os.environ.get("KEGELKASSE_EMAIL", "").strip()
        password = os.environ.get("KEGELKASSE_PASSWORD", "")
        timeout = float(os.environ.get("KEGELKASSE_TIMEOUT", "30"))
        return cls(
            base_url=raw_url,
            token=token,
            email=email,
            password=password,
            timeout=timeout,
        )

    @property
    def mcp_url(self) -> str:
        return f"{self.base_url}/mcp"


class KegelkasseBearerAuth(httpx.Auth):
    """Injects a Bearer token and refreshes JWTs on 401 when email/password are configured."""

    def __init__(
        self,
        config: KegelkasseConfig,
        auth_client_factory: Optional[Callable[[], httpx.AsyncClient]] = None,
    ) -> None:
        self.config = config
        self._access_token: str = config.token
        self._refresh_token: str = ""
        self._lock = asyncio.Lock()
        self._auth_client_factory = auth_client_factory or (
            lambda: httpx.AsyncClient(base_url=config.base_url, timeout=config.timeout)
        )

    @property
    def _has_credentials(self) -> bool:
        return bool(self.config.email and self.config.password)

    async def _login(self, client: httpx.AsyncClient) -> str:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": self.config.email, "password": self.config.password},
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"Kegelkasse login failed ({resp.status_code}): {resp.text}")
        data = resp.json()
        self._access_token = data["access_token"]
        self._refresh_token = data.get("refresh_token", "")
        return self._access_token

    async def _refresh_or_login(self) -> str:
        async with self._lock:
            async with self._auth_client_factory() as client:
                if self._refresh_token:
                    resp = await client.post(
                        "/api/v1/auth/refresh",
                        json={"refresh_token": self._refresh_token},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        self._access_token = data["access_token"]
                        self._refresh_token = data.get("refresh_token", self._refresh_token)
                        return self._access_token
                return await self._login(client)

    async def ensure_token(self) -> str:
        if self._access_token:
            return self._access_token
        if not self._has_credentials:
            raise RuntimeError(
                "Missing authentication: set KEGELKASSE_MCP_TOKEN, KEGELKASSE_TOKEN, "
                "or KEGELKASSE_EMAIL + KEGELKASSE_PASSWORD."
            )
        async with self._lock:
            if not self._access_token:
                async with self._auth_client_factory() as client:
                    await self._login(client)
            return self._access_token

    async def async_auth_flow(
        self, request: httpx.Request
    ) -> AsyncGenerator[httpx.Request, httpx.Response]:
        token = await self.ensure_token()
        request.headers["Authorization"] = f"Bearer {token}"
        response = yield request

        if response.status_code == 401 and self._has_credentials and not self.config.token:
            new_token = await self._refresh_or_login()
            request.headers["Authorization"] = f"Bearer {new_token}"
            yield request


@dataclass
class RemoteMcpBridge:
    """Proxies MCP tool calls from stdio to a remote Kegelkasse /mcp endpoint."""

    config: KegelkasseConfig
    http_client_factory: Optional[Callable[[httpx.Auth], httpx.AsyncClient]] = None
    auth_client_factory: Optional[Callable[[], httpx.AsyncClient]] = None
    auth: KegelkasseBearerAuth = field(init=False)

    def __post_init__(self) -> None:
        self.auth = KegelkasseBearerAuth(self.config, auth_client_factory=self.auth_client_factory)

    def _build_client(self) -> httpx.AsyncClient:
        if self.http_client_factory is not None:
            return self.http_client_factory(self.auth)
        return httpx.AsyncClient(
            auth=self.auth,
            timeout=httpx.Timeout(self.config.timeout, read=self.config.timeout * 4),
        )

    async def list_tools(self) -> list[types.Tool]:
        async with self._build_client() as http_client:
            async with streamable_http_client(self.config.mcp_url, http_client=http_client) as (
                read_stream,
                write_stream,
            ):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    result = await session.list_tools()
                    return list(result.tools)

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> types.CallToolResult:
        async with self._build_client() as http_client:
            async with streamable_http_client(self.config.mcp_url, http_client=http_client) as (
                read_stream,
                write_stream,
            ):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()
                    return await session.call_tool(name, arguments)


def create_stdio_server(bridge: RemoteMcpBridge) -> Server:
    """Create a low-level MCP Server forwarding tools to ``bridge``."""

    async def handle_list_tools(
        _ctx: ServerRequestContext, _params: types.PaginatedRequestParams | None
    ) -> types.ListToolsResult:
        return types.ListToolsResult(tools=await bridge.list_tools())

    async def handle_call_tool(
        _ctx: ServerRequestContext, params: types.CallToolRequestParams
    ) -> types.CallToolResult:
        return await bridge.call_tool(params.name, params.arguments or {})

    return Server(
        "Kegelkasse Roadmap",
        version="1.0.0",
        on_list_tools=handle_list_tools,
        on_call_tool=handle_call_tool,
    )


async def _run_stdio() -> None:
    config = KegelkasseConfig.from_env()
    bridge = RemoteMcpBridge(config)
    server = create_stdio_server(bridge)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(notification_options=NotificationOptions()),
        )


def main() -> None:
    asyncio.run(_run_stdio())


if __name__ == "__main__":
    main()

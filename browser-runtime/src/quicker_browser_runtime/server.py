from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from aiohttp import web

from quicker_browser_runtime.config import RuntimeConfig
from quicker_browser_runtime.panel_stream import panel_ws_handler
from quicker_browser_runtime.session_manager import SessionManager

logger = logging.getLogger(__name__)

PROTOCOL_VERSION = "quicker-browser-v1"


def _cors(response: web.StreamResponse) -> web.StreamResponse:
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


class BrowserRuntimeApp:
    def __init__(self, config: RuntimeConfig, manager: SessionManager) -> None:
        self._config = config
        self._manager = manager

    def health_payload(self) -> dict[str, Any]:
        return {
            "ok": True,
            "protocolVersion": PROTOCOL_VERSION,
            "runtimeVersion": self._config.runtime_version,
            "browserReady": self._manager.browser_ready,
            "browserError": self._manager.browser_error,
            "sessionCount": self._manager.session_count,
            "headless": self._config.headless,
            "channel": self._config.channel,
        }

    async def health_handler(self, request: web.Request) -> web.Response:
        return _cors(web.json_response(self.health_payload()))

    async def options_handler(self, request: web.Request) -> web.Response:
        response = web.Response(status=204)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        return response

    async def invoke_handler(self, request: web.Request) -> web.Response:
        try:
            body = await request.json()
        except json.JSONDecodeError:
            return _cors(
                web.json_response(
                    {"ok": False, "message": "Invalid JSON body"},
                    status=400,
                ),
            )

        if not isinstance(body, dict):
            return _cors(
                web.json_response(
                    {"ok": False, "message": "Body must be a JSON object"},
                    status=400,
                ),
            )

        op = str(body.get("op") or "").strip()
        if not op:
            return _cors(
                web.json_response(
                    {"ok": False, "message": "op is required"},
                    status=400,
                ),
            )

        session_id = str(body.get("sessionId") or "default").strip() or "default"
        args_raw = body.get("args")
        args = args_raw if isinstance(args_raw, dict) else {}

        result = await self._manager.invoke(op, args, session_id)
        status = 200 if result.get("ok") else 502
        return _cors(web.json_response(result, status=status))

    def create_web_app(self) -> web.Application:
        app = web.Application()
        app.router.add_route("OPTIONS", "/health", self.options_handler)
        app.router.add_route("OPTIONS", "/v1/invoke", self.options_handler)
        app.router.add_route("OPTIONS", "/v1/panel/ws", self.options_handler)
        app.router.add_get("/health", self.health_handler)
        app.router.add_post("/v1/invoke", self.invoke_handler)
        app.router.add_get("/v1/panel/ws", panel_ws_handler)
        return app


async def run_server(config: RuntimeConfig, manager: SessionManager) -> None:
    runtime = BrowserRuntimeApp(config, manager)
    app = runtime.create_web_app()
    app["session_manager"] = manager
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, config.host, config.port)
    await site.start()
    logger.info(
        "quicker-browser-runtime %s listening on http://%s:%s/health",
        config.runtime_version,
        config.host,
        config.port,
    )
    try:
        await asyncio.Event().wait()
    finally:
        await manager.shutdown()
        await runner.cleanup()

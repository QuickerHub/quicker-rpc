from __future__ import annotations

import asyncio
import json
import logging
from contextlib import suppress
from typing import Any

from aiohttp import WSMsgType, web

from quicker_browser_runtime.session_manager import SessionManager

logger = logging.getLogger(__name__)


class PanelStreamConnection:
    """Stream Playwright page frames over WebSocket (VS Code-style remote browser)."""

    def __init__(self, ws: web.WebSocketResponse, manager: SessionManager) -> None:
        self._ws = ws
        self._manager = manager
        self._session_id = "default"
        self._cdp: Any | None = None
        self._screencast_started = False
        self._closed = False
        self._state_task: asyncio.Task[None] | None = None

    async def run(self) -> None:
        try:
            async for msg in self._ws:
                if msg.type == WSMsgType.TEXT:
                    await self._handle_text(msg.data)
                elif msg.type in {WSMsgType.CLOSE, WSMsgType.CLOSING, WSMsgType.ERROR}:
                    break
        finally:
            await self._cleanup()

    async def _send(self, payload: dict[str, Any]) -> None:
        if self._closed or self._ws.closed:
            return
        try:
            await self._ws.send_str(json.dumps(payload, ensure_ascii=False))
        except ConnectionResetError:
            self._closed = True

    async def _handle_text(self, raw: str) -> None:
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            await self._send({"type": "error", "message": "Invalid JSON"})
            return
        if not isinstance(message, dict):
            await self._send({"type": "error", "message": "Message must be an object"})
            return

        msg_type = str(message.get("type") or "").strip()
        if msg_type == "subscribe":
            session_id = str(message.get("sessionId") or "default").strip() or "default"
            self._session_id = session_id
            await self._manager.ensure_session(session_id)
            await self._start_screencast()
            await self._push_state()
            if self._state_task is None or self._state_task.done():
                self._state_task = asyncio.create_task(self._state_loop())
            await self._send({"type": "ready", "sessionId": session_id})
            return

        if msg_type == "viewport":
            width = int(message.get("width") or 0)
            height = int(message.get("height") or 0)
            if width < 120 or height < 120:
                return
            session = await self._manager.ensure_session(self._session_id)
            await session.page.set_viewport_size({"width": width, "height": height})
            return

        session = await self._manager.ensure_session(self._session_id)
        page = session.page

        if msg_type == "click":
            x = int(message.get("x") or 0)
            y = int(message.get("y") or 0)
            button = str(message.get("button") or "left")
            await page.mouse.click(x, y, button=button)  # type: ignore[arg-type]
            session.ref_map.clear()
            await self._push_state()
            return

        if msg_type == "wheel":
            delta_x = float(message.get("deltaX") or 0)
            delta_y = float(message.get("deltaY") or 0)
            await page.mouse.wheel(delta_x, delta_y)
            return

        if msg_type == "keydown":
            key = str(message.get("key") or "").strip()
            if not key:
                return
            await page.keyboard.press(key)
            await self._push_state()
            return

        if msg_type == "type":
            text = str(message.get("text") or "")
            if not text:
                return
            await page.keyboard.type(text)
            await self._push_state()
            return

        await self._send({"type": "error", "message": f"Unknown message type: {msg_type}"})

    async def _start_screencast(self) -> None:
        if self._screencast_started:
            return
        session = await self._manager.ensure_session(self._session_id)
        self._cdp = await session.context.new_cdp_session(session.page)

        def on_frame(params: dict[str, Any]) -> None:
            if self._closed:
                return
            asyncio.create_task(self._on_screencast_frame(params))

        self._cdp.on("Page.screencastFrame", on_frame)
        await self._cdp.send(
            "Page.startScreencast",
            {"format": "jpeg", "quality": 72, "everyNthFrame": 1},
        )
        self._screencast_started = True

    async def _on_screencast_frame(self, params: dict[str, Any]) -> None:
        if self._closed or self._cdp is None:
            return
        data = params.get("data")
        if not isinstance(data, str) or not data:
            return
        await self._send(
            {
                "type": "frame",
                "sessionId": self._session_id,
                "mimeType": "image/jpeg",
                "data": data,
            },
        )
        session_id = params.get("sessionId")
        if isinstance(session_id, str):
            try:
                await self._cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
            except Exception:
                pass

    async def _push_state(self) -> None:
        session = await self._manager.ensure_session(self._session_id)
        viewport = session.page.viewport_size or {"width": 1280, "height": 800}
        await self._send(
            {
                "type": "state",
                "sessionId": self._session_id,
                "url": session.page.url,
                "title": await session.page.title(),
                "viewportWidth": int(viewport.get("width") or 1280),
                "viewportHeight": int(viewport.get("height") or 800),
            },
        )

    async def _state_loop(self) -> None:
        while not self._closed:
            try:
                await self._push_state()
            except Exception as exc:
                logger.debug("panel state push failed: %s", exc)
            await asyncio.sleep(1.5)

    async def _cleanup(self) -> None:
        self._closed = True
        if self._state_task is not None:
            self._state_task.cancel()
            with suppress(asyncio.CancelledError):
                await self._state_task
        if self._cdp is not None:
            with suppress(Exception):
                if self._screencast_started:
                    await self._cdp.send("Page.stopScreencast")
                await self._cdp.detach()
        self._cdp = None
        self._screencast_started = False


async def panel_ws_handler(request: web.Request) -> web.WebSocketResponse:
    manager: SessionManager = request.app["session_manager"]
    ws = web.WebSocketResponse(heartbeat=20.0)
    await ws.prepare(request)
    connection = PanelStreamConnection(ws, manager)
    await connection.run()
    return ws

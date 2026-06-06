from __future__ import annotations

import asyncio
import base64
import logging
import sys
from dataclasses import dataclass, field
from typing import Any

from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)

from quicker_browser_runtime.config import RuntimeConfig
from quicker_browser_runtime.protocol import RefTarget, format_snapshot_yaml, invoke_error, invoke_ok
from quicker_browser_runtime.snapshot import collect_interactive_nodes, resolve_locator

logger = logging.getLogger(__name__)

_PREVIEW_OPS = frozenset(
    {
        "page.navigate",
        "page.snapshot",
        "page.click",
        "page.click_xy",
        "page.type",
        "page.fill",
        "page.press",
        "page.back",
        "page.forward",
        "page.reload",
        "page.screenshot",
    },
)


async def _capture_panel_preview(session: BrowserSession) -> dict[str, Any]:
    viewport = session.page.viewport_size or {"width": 1280, "height": 800}
    jpeg = await session.page.screenshot(type="jpeg", quality=58, full_page=False)
    return {
        "url": session.page.url,
        "title": await session.page.title(),
        "previewBase64": base64.b64encode(jpeg).decode("ascii"),
        "previewMimeType": "image/jpeg",
        "viewportWidth": int(viewport.get("width") or 1280),
        "viewportHeight": int(viewport.get("height") or 800),
    }


async def _ok_with_preview(
    session: BrowserSession,
    op: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    data = dict(payload)
    if op in _PREVIEW_OPS:
        try:
            data.update(await _capture_panel_preview(session))
        except Exception as exc:
            logger.warning("panel preview capture failed: %s", exc)
    return invoke_ok(data)


@dataclass
class BrowserSession:
    session_id: str
    context: BrowserContext
    page: Page
    ref_map: dict[str, RefTarget] = field(default_factory=dict)


class SessionManager:
    def __init__(self, config: RuntimeConfig) -> None:
        self._config = config
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._sessions: dict[str, BrowserSession] = {}
        self._lock = asyncio.Lock()
        self._browser_ready = False
        self._browser_error: str | None = None

    @property
    def browser_ready(self) -> bool:
        return self._browser_ready

    @property
    def browser_error(self) -> str | None:
        return self._browser_error

    @property
    def session_count(self) -> int:
        return len(self._sessions)

    async def shutdown(self) -> None:
        for session in list(self._sessions.values()):
            try:
                await session.context.close()
            except Exception:
                pass
        self._sessions.clear()
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._playwright is not None:
            try:
                await self._playwright.stop()
            except Exception:
                pass
            self._playwright = None
        self._browser_ready = False

    async def _ensure_browser(self) -> None:
        if self._browser is not None and self._browser_ready:
            return
        if self._browser_error:
            raise RuntimeError(self._browser_error)

        self._config.user_data_dir.mkdir(parents=True, exist_ok=True)
        self._playwright = await async_playwright().start()

        launch_kwargs: dict[str, Any] = {
            "headless": self._config.headless,
            "args": ["--disable-dev-shm-usage"],
        }
        if self._config.channel:
            launch_kwargs["channel"] = self._config.channel

        try:
            self._browser = await self._playwright.chromium.launch(**launch_kwargs)
        except Exception as exc:
            logger.warning("Launch with channel=%s failed: %s", self._config.channel, exc)
            try:
                self._browser = await self._playwright.chromium.launch(
                    headless=self._config.headless,
                )
            except Exception as fallback_exc:
                self._browser_error = (
                    f"Failed to launch browser: {fallback_exc}. "
                    "Run: uv run playwright install msedge (Windows) or playwright install chromium"
                )
                raise RuntimeError(self._browser_error) from fallback_exc

        self._browser_ready = True
        self._browser_error = None
        logger.info(
            "Browser launched (headless=%s, channel=%s)",
            self._config.headless,
            self._config.channel,
        )

    async def ensure_session(self, session_id: str) -> BrowserSession:
        async with self._lock:
            existing = self._sessions.get(session_id)
            if existing is not None and not existing.page.is_closed():
                return existing

            await self._ensure_browser()
            assert self._browser is not None

            context = await self._browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent=None,
            )
            page = await context.new_page()
            session = BrowserSession(session_id=session_id, context=context, page=page)
            self._sessions[session_id] = session
            return session

    async def close_session(self, session_id: str) -> None:
        async with self._lock:
            session = self._sessions.pop(session_id, None)
            if session is None:
                return
            try:
                await session.context.close()
            except Exception:
                pass

    def _session_or_error(self, session_id: str) -> BrowserSession | dict[str, Any]:
        session = self._sessions.get(session_id)
        if session is None or session.page.is_closed():
            return invoke_error(f"Session '{session_id}' not found; call session.ensure first")
        return session

    async def invoke(self, op: str, args: dict[str, Any], session_id: str) -> dict[str, Any]:
        try:
            if op == "status":
                return invoke_ok(
                    {
                        "browserReady": self._browser_ready,
                        "browserError": self._browser_error,
                        "sessionCount": self.session_count,
                        "headless": self._config.headless,
                        "channel": self._config.channel,
                        "platform": sys.platform,
                    },
                )

            if op == "session.ensure":
                session = await self.ensure_session(session_id)
                return invoke_ok(
                    {
                        "sessionId": session.session_id,
                        "url": session.page.url,
                        "title": await session.page.title(),
                    },
                )

            if op == "session.close":
                await self.close_session(session_id)
                return invoke_ok({"sessionId": session_id, "closed": True})

            if op in {
                "page.navigate",
                "page.snapshot",
                "page.click",
                "page.click_xy",
                "page.type",
                "page.fill",
                "page.press",
                "page.wait",
                "page.screenshot",
                "page.back",
                "page.forward",
                "page.reload",
                "page.tabs",
            }:
                session_result = self._session_or_error(session_id)
                if isinstance(session_result, dict):
                    if op == "page.navigate":
                        await self.ensure_session(session_id)
                        session_result = self._session_or_error(session_id)
                        if isinstance(session_result, dict):
                            return session_result
                    else:
                        return session_result
                session = session_result

            if op == "page.navigate":
                url = str(args.get("url") or "").strip()
                if not url:
                    return invoke_error("url is required")
                wait_until = str(args.get("waitUntil") or "domcontentloaded")
                timeout_ms = int(args.get("timeoutMs") or 30_000)
                response = await session.page.goto(
                    url,
                    wait_until=wait_until,  # type: ignore[arg-type]
                    timeout=timeout_ms,
                )
                session.ref_map.clear()
                return await _ok_with_preview(
                    session,
                    op,
                    {
                        "url": session.page.url,
                        "title": await session.page.title(),
                        "status": response.status if response else None,
                    },
                )

            if op == "page.snapshot":
                nodes = await collect_interactive_nodes(session.page)
                ref_map: dict[str, RefTarget] = {}
                role_counts: dict[tuple[str, str | None], int] = {}
                for node in nodes:
                    key = (node["role"], node.get("name") or None)
                    nth = role_counts.get(key, 0)
                    role_counts[key] = nth + 1
                    ref = f"e{len(ref_map) + 1}"
                    ref_map[ref] = RefTarget(
                        role=node["role"],
                        name=node.get("name") or None,
                        nth=nth,
                    )
                session.ref_map = ref_map
                snapshot = format_snapshot_yaml(
                    session.page.url,
                    await session.page.title(),
                    ref_map,
                )
                return await _ok_with_preview(
                    session,
                    op,
                    {
                        "url": session.page.url,
                        "title": await session.page.title(),
                        "snapshot": snapshot,
                        "nodeCount": len(ref_map),
                    },
                )

            if op == "page.click":
                ref = str(args.get("ref") or "").strip()
                if not ref:
                    return invoke_error("ref is required (from last snapshot)")
                target = session.ref_map.get(ref)
                if target is None:
                    return invoke_error(f"Unknown ref '{ref}'; call page.snapshot first")
                locator = resolve_locator(session.page, target)
                timeout_ms = int(args.get("timeoutMs") or 10_000)
                await locator.click(timeout=timeout_ms)
                return await _ok_with_preview(
                    session,
                    op,
                    {"ref": ref, "clicked": True, "url": session.page.url},
                )

            if op == "page.click_xy":
                x = int(args.get("x"))
                y = int(args.get("y"))
                if x < 0 or y < 0:
                    return invoke_error("x and y must be non-negative")
                await session.page.mouse.click(x, y)
                session.ref_map.clear()
                return await _ok_with_preview(
                    session,
                    op,
                    {"clicked": True, "x": x, "y": y, "url": session.page.url},
                )

            if op == "page.type":
                ref = str(args.get("ref") or "").strip()
                text = str(args.get("text") or "")
                if not ref:
                    return invoke_error("ref is required")
                if not text:
                    return invoke_error("text is required")
                target = session.ref_map.get(ref)
                if target is None:
                    return invoke_error(f"Unknown ref '{ref}'; call page.snapshot first")
                locator = resolve_locator(session.page, target)
                delay = int(args.get("delayMs") or 0)
                await locator.type(text, delay=delay)
                return await _ok_with_preview(
                    session,
                    op,
                    {"ref": ref, "typedLength": len(text)},
                )

            if op == "page.fill":
                ref = str(args.get("ref") or "").strip()
                value = str(args.get("value") if args.get("value") is not None else args.get("text") or "")
                if not ref:
                    return invoke_error("ref is required")
                target = session.ref_map.get(ref)
                if target is None:
                    return invoke_error(f"Unknown ref '{ref}'; call page.snapshot first")
                locator = resolve_locator(session.page, target)
                await locator.fill(value)
                return await _ok_with_preview(
                    session,
                    op,
                    {"ref": ref, "filled": True},
                )

            if op == "page.press":
                key = str(args.get("key") or "").strip()
                if not key:
                    return invoke_error("key is required (e.g. Enter, Tab)")
                ref = str(args.get("ref") or "").strip()
                if ref:
                    target = session.ref_map.get(ref)
                    if target is None:
                        return invoke_error(f"Unknown ref '{ref}'; call page.snapshot first")
                    locator = resolve_locator(session.page, target)
                    await locator.press(key)
                else:
                    await session.page.keyboard.press(key)
                return await _ok_with_preview(
                    session,
                    op,
                    {"key": key, "ref": ref or None},
                )

            if op == "page.wait":
                timeout_ms = int(args.get("timeoutMs") or 5_000)
                text = str(args.get("text") or "").strip()
                ref = str(args.get("ref") or "").strip()
                state = str(args.get("state") or "visible").strip()
                if text:
                    await session.page.get_by_text(text, exact=False).first.wait_for(
                        state=state,  # type: ignore[arg-type]
                        timeout=timeout_ms,
                    )
                elif ref:
                    target = session.ref_map.get(ref)
                    if target is None:
                        return invoke_error(f"Unknown ref '{ref}'; call page.snapshot first")
                    locator = resolve_locator(session.page, target)
                    await locator.wait_for(state=state, timeout=timeout_ms)  # type: ignore[arg-type]
                else:
                    await asyncio.sleep(timeout_ms / 1000)
                return invoke_ok({"waited": True})

            if op == "page.screenshot":
                full_page = bool(args.get("fullPage"))
                data = await _capture_panel_preview(session)
                if full_page:
                    png = await session.page.screenshot(full_page=True, type="png")
                    encoded = base64.b64encode(png).decode("ascii")
                    truncated = len(encoded) > 400_000
                    if truncated:
                        encoded = encoded[:400_000]
                    data["mimeType"] = "image/png"
                    data["base64"] = encoded
                    data["truncated"] = truncated
                return invoke_ok(data)

            if op == "page.back":
                await session.page.go_back()
                session.ref_map.clear()
                return await _ok_with_preview(
                    session,
                    op,
                    {"url": session.page.url, "title": await session.page.title()},
                )

            if op == "page.forward":
                await session.page.go_forward()
                session.ref_map.clear()
                return await _ok_with_preview(
                    session,
                    op,
                    {"url": session.page.url, "title": await session.page.title()},
                )

            if op == "page.reload":
                wait_until = str(args.get("waitUntil") or "domcontentloaded")
                await session.page.reload(wait_until=wait_until)  # type: ignore[arg-type]
                session.ref_map.clear()
                return await _ok_with_preview(
                    session,
                    op,
                    {"url": session.page.url, "title": await session.page.title()},
                )

            if op == "page.tabs":
                pages = session.context.pages
                tabs = []
                for index, page in enumerate(pages):
                    tabs.append(
                        {
                            "index": index,
                            "url": page.url,
                            "title": await page.title(),
                            "active": page is session.page,
                        },
                    )
                return invoke_ok({"tabs": tabs, "count": len(tabs)})

            return invoke_error(f"Unknown op: {op}", code="unknown_op")
        except Exception as exc:
            logger.exception("invoke failed op=%s session=%s", op, session_id)
            return invoke_error(str(exc))

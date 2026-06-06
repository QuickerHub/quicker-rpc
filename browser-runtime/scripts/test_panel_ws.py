"""Quick manual check for /v1/panel/ws (run after restarting runtime)."""

from __future__ import annotations

import asyncio
import json

import aiohttp


async def main() -> None:
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect("http://127.0.0.1:6017/v1/panel/ws", timeout=8) as ws:
            await ws.send_str(json.dumps({"type": "subscribe", "sessionId": "default"}))
            for _ in range(5):
                msg = await asyncio.wait_for(ws.receive(), timeout=10)
                if msg.type.name != "TEXT":
                    print("non-text", msg.type)
                    continue
                data = json.loads(msg.data)
                print("recv", data.get("type"), data.get("url", ""))


if __name__ == "__main__":
    asyncio.run(main())

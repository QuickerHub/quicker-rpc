# quicker-browser-runtime

Local Playwright browser server for QuickerAgent (`browser` agent tool).

## Setup

```powershell
cd browser-runtime
uv sync
uv run playwright install msedge   # Windows: use Edge; or `playwright install chromium`
```

## Run

```powershell
uv run quicker-browser-runtime --host 127.0.0.1 --port 6017
```

Health: `GET http://127.0.0.1:6017/health`

Invoke: `POST http://127.0.0.1:6017/v1/invoke`

```json
{
  "op": "page.navigate",
  "sessionId": "default",
  "args": { "url": "https://example.com" }
}
```

## Environment

| Variable | Default |
|----------|---------|
| `QUICKER_BROWSER_HOST` | `127.0.0.1` |
| `QUICKER_BROWSER_PORT` | `6017` |
| `QUICKER_BROWSER_HEADLESS` | `1` (headless; preview in agent-gui panel) |
| `QUICKER_BROWSER_CHANNEL` | `msedge` on Windows, else chromium |

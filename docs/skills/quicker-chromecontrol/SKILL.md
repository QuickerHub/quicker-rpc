---
name: quicker-chromecontrol
description: "Control the user's real browser (Quicker Connector) via user_browser / qkrpc_chrome_control RPC, or author sys:chromecontrol steps in actions."
---

# quicker-chromecontrol

Route for **browser automation** against the user's logged-in browser.

**See also:** [docs/browser-automation.md](../../browser-automation.md) — unified boundary table (Playwright / embedded / extension).

## Agent vs action browser

| | QuickerAgent **`browser`** | **`user_browser`** / **`qkrpc_chrome_control`** | **sys:chromecontrol** steps |
|--|---------------------------|--------------------------------------------------|----------------------------|
| Who runs | Agent Playwright session | Agent via RPC → Quicker extension | User's action at runtime |
| Login state | None (clean profile) | **User's cookies / login** | **User's cookies / login** |
| Needs extension | No | Yes (Quicker Connector) | Yes |
| Use for | Agent reads arbitrary URL while designing | Agent operates user's open browser in chat | Production automation in saved actions |

## Live control (agent in chat)

1. `user_browser({ action: "tabs" })` or MCP `qkrpc_chrome_tabs` — list connected tabs
2. `user_browser({ action: "run", operation: "OpenUrl", parameters: { url, windowId: "New", waitComplete: true } })`
3. Reuse **`sessionId`**; **`tabId`** from OpenUrl is auto-carried when omitted on next run
4. CLI: `qkrpc chrome run --operation RunScript --params '{"script":"document.title"}' --json`

Parameter schema: **`qkrpc_step_runner_get`** with `key=sys:chromecontrol` and `controlField` = operation.

## Authoring actions (on disk)

1. `qkrpc_step_runner_search` → `sys:chromecontrol`
2. `qkrpc_step_runner_get` with `controlField` = operation
3. `docs({ action: "get", topic: "chromecontrol-authoring" })`
4. Patch: `reference: "examples/chromecontrol"`

## Hard rules

- Reuse **tabId** across steps (`tabId.var` in actions; literal `tabId` or session in RPC)
- **RunScript** on MV3: user must enable extension **Allow user scripts**
- Prefer **BackgroundCommand** over legacy BackgroundScript on MV3
- Do not guess `inputParams` keys — always **step_runner_get** first

## Related

quicker-browser-script (page script + trigger auto-run pipeline) · quicker-authoring · qkrpc · browser (Playwright, no login)

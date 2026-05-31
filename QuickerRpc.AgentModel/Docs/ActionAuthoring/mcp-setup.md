# MCP setup

For **QuickerRpc plugin** (`qkrpc mcp` stdio). Requires Quicker running with the QuickerRpc plugin loaded.

## Prerequisites

1. Install **`qkrpc`** CLI and verify: `qkrpc ping --json`.
2. **Run Quicker** (signed in, profile loaded) with QuickerRpc plugin.
3. **Configure MCP** in your editor (Cursor example):

```json
{
  "mcpServers": {
    "quicker-mcp": {
      "command": "qkrpc",
      "args": ["mcp"]
    }
  }
}
```

Optional: `qkrpc mcp --timeout 60` if large actions time out. Config file location is defined by your AI tool (Cursor: Settings → MCP).

## What you edit

| Item | Detail |
|------|--------|
| `actionId` | GUID for an action in your **current profile** |
| Discovery | `action_search` when `actionId` unknown |
| New actions | Create in Quicker UI first — **qkrpc MCP has no `action_create`** |

## Agent workflow entry

1. **`guide_get`** with `topic: "overview"` (or **`guide_search`** to find a topic).
2. Follow linked topics (`xaction-json`, `patch-workflow`, `step-modules`, …) before writing patches.

## Doc topics

`overview` · `implementation-fallback` · `step-modules` · `step-runner-search` · `xaction-json` · `variables` · `expressions` · `patch-workflow`

Load: `guide_get({ "topic": "overview" })` or `guide_search`.

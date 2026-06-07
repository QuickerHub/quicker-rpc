# @quickerhub/qkrpc-mcp

Thin npm wrapper that runs the local **`qkrpc mcp`** stdio server for MCP hosts.

## Prerequisites

1. Install [qkrpc CLI](https://github.com/QuickerHub/quicker-rpc/releases/latest) (`qkrpc-win-x64-setup.exe`)
2. Quicker running with **QuickerRpc** plugin loaded

## MCP config (stdio)

```json
{
  "command": "npx",
  "args": ["-y", "@quickerhub/qkrpc-mcp"],
  "env": {
    "QKRPC_WORKSPACE_ROOT": "D:\\your-workspace"
  }
}
```

Or after `npm install -g @quickerhub/qkrpc-mcp`:

```json
{
  "command": "qkrpc-mcp",
  "args": [],
  "env": {
    "QKRPC_WORKSPACE_ROOT": "D:\\your-workspace"
  }
}
```

Override CLI path:

```json
{
  "env": {
    "QKRPC_EXE": "D:\\path\\to\\qkrpc.exe"
  }
}
```

## Recommended setup (skills + rules)

This package only launches MCP. For Cursor skills and rules:

```powershell
qkrpc agent setup
```

See [docs/agent-mcp-integration.md](../../docs/agent-mcp-integration.md) in the quicker-rpc repo.

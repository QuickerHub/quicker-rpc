---
name: quicker-sync
description: "Deprecated — use quicker-authoring (workspace-editing) with host file tools + workspace_program patch. Kept only for old skill installs."
---

# quicker-sync (deprecated)

**Use `quicker-authoring`** instead. Disk workflow for third-party MCP:

1. `qkrpc_action_get` / `qkrpc_subprogram_get` — pull to `.quicker/`
2. Edit `data.json` / `files/` with your **host file tools** (not MCP)
3. `workspace_program` `action=patch` — save to Quicker

Read: `docs` topic `workspace-editing`, MCP resource `quicker://workspace/readme`.

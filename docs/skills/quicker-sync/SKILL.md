---
name: quicker-sync
description: "Use when pulling or pushing Quicker action workspace files under .quicker/ via qkrpc_sync (third-party MCP agents)."
---

# quicker-sync

Disk workflow for third-party agents **without** `workspace_program`. Sync between Quicker and `.quicker/` on disk.

## When to use

- Pull action/subprogram body from Quicker → edit `data.json` / `files/`
- Push disk edits back to Quicker
- Check sync status before/after edits

## MCP tools

| Intent | Tool |
|--------|------|
| Pull from Quicker | `qkrpc_sync` action `pull` |
| Push to Quicker | `qkrpc_sync` action `push` |
| Status | `qkrpc_sync` action `status` |

CLI equivalent: `qkrpc sync pull|push|status --json`

## Typical flow

```text
1. qkrpc_action (get/list) or qkrpc_sync pull — materialize .quicker/
2. Edit data.json / files/ with file tools (NOT inline patch)
3. qkrpc_sync push — save to Quicker
4. Trust editVersion; optional diagnostics via CLI
```

## Hard rules

- Edit `data.json` on disk, then **push** — no inline patch / `--patch-file` in MCP agents
- Long step bodies (>4 lines): use `files/` refs per authoring-workflow
- After push, do **not** re-get to verify unless debugging

Deep-read: `docs_get` topic `workspace-editing`, `authoring-workflow`.

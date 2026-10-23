<!-- qkrpc-agent-setup:begin -->

## Quicker / qkrpc (MCP)

Configure `qkrpc` MCP per `docs/agent-mcp-self-install.md` in the quicker-rpc repo (or run the steps below once).

**Install (Codex, recommended):**

```powershell
qkrpc agent setup --codex
# then in Codex: /plugins → install quicker-rpc
codex mcp list
```

Legacy manual `codex mcp add` (only if not using the plugin):

**V1/qkrpc start:** `qkrpc_health` → on failure `qkrpc_wait` (no repeated shell probes). Existing V2 account programs prefer independent `quicker` CLI 0.3.0+ catalog export/apply, then V2 pulls sync; local drafts/new programs use native MCP `quicker_open` / `quicker_create`.

**Authoring:** Existing V1 actions: `docs` action=get topic `program-source`. QuickerAgent/legacy JSON/creation: `overview` → `authoring-workflow`; subprograms: `subprogram-workflow`. Step-runner: `qkrpc_step_runner_search` → `qkrpc_step_runner_get` — never guess `inputParams`.

**V1 existing action:** `qkrpc_action_open(id, dir)` into an empty directory → edit `program.source.yaml` / `files/` → `qkrpc_action_save(dir, dryRun=true)` → save. Preserve tool-managed `quicker.source.json` / `.qkrpc/baseline.json`; save checks versions and Designer state. CLI: `action open --id <guid> --dir <empty>` / `action save --dir <dir> [--dry-run]`.

**V1 subprograms / QuickerAgent / legacy JSON:** Keep MCP resource `quicker://workspace/readme` or `docs` topic `workspace-editing`. Edit `.quicker/` with your **file tools** → `workspace_program` action=patch. Creation/metadata retain existing commands. V2 local drafts/new programs use native MCP to edit `program.source.yaml` in a draft slot and `quicker_save`.

**Re-install / upgrade CLI:** re-run MCP add with updated `qkrpc.exe` path; see `docs/agent-mcp-self-install.md`.

<!-- qkrpc-agent-setup:end -->

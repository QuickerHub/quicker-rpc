<!-- qkrpc-agent-setup:begin -->

## Quicker / qkrpc (MCP)

You have `qkrpc` MCP tools when this project or `~/.claude/` is configured via `qkrpc agent setup`.

**Start:** `qkrpc_health` → on failure `qkrpc_wait` (no repeated shell probes).

**Authoring:** `docs_get` topics `overview` → `authoring-workflow`. Step-runner: `qkrpc_step_runner_search` → `qkrpc_step_runner_get` — never guess `inputParams`.

**Disk edit (no workspace_program):** edit `.quicker/` `data.json` / `files/` → `qkrpc_sync push`.

**Refresh skills/rules after CLI upgrade:** `qkrpc agent setup --upgrade`

Guide: `docs/agent-mcp-integration.md` in quicker-rpc repo.

<!-- qkrpc-agent-setup:end -->

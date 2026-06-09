<!-- qkrpc-agent-setup:begin -->

## Quicker / qkrpc (MCP)

You have `qkrpc` MCP tools when this project or `~/.claude/` is configured via `qkrpc agent setup`.

**Start:** `qkrpc_health` → on failure `qkrpc_wait` (no repeated shell probes).

**Authoring:** `docs` action=get topics `overview` → `authoring-workflow`. Step-runner: `qkrpc_step_runner_search` → `qkrpc_step_runner_get` — never guess `inputParams`.

**Disk edit:** read layout via MCP resource `quicker://workspace/readme` or `docs` topic `workspace-editing`. Edit `.quicker/` `data.json` / `files/` with your **file tools** → `workspace_program` action=patch.

**Refresh skills/rules after CLI upgrade:** `qkrpc agent setup --upgrade`

Guide: `docs/agent-mcp-integration.md` in quicker-rpc repo.

<!-- qkrpc-agent-setup:end -->

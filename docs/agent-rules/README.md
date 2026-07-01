# Agent rules snippets

**Single source** for qkrpc routing rules copied by `qkrpc agent setup` and `scripts/sync-cursor-plugin.ps1`.

| File | Copied to |
|------|-----------|
| `qkrpc.mdc` | `~/.cursor/rules/` (setup), `cursor-plugin/quicker-rpc/rules/` (sync, gitignored) |
| `claude-qkrpc.md` | `~/.claude/CLAUDE.md` merge |
| `codex-qkrpc.md` | project `AGENTS.md` merge (`--project`) |

**quicker-workspace** parent repo: run `pwsh ./scripts/Sync-QkrpcAgentRules.ps1` after editing `qkrpc.mdc` here. Workspace map: parent `docs/qkrpc-agent-usage.md`, skill `.cursor/skills/qkrpc-usage/`.

Do **not** duplicate authoring skills under `.cursor/skills/` in the qkrpc repo — use `qkrpc agent setup --upgrade` (see `AGENTS.md`).

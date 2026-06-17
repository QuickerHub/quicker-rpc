# Agent rules snippets

**Single source** for qkrpc routing rules copied by `qkrpc agent setup` and `scripts/sync-cursor-plugin.ps1`.

| File | Copied to |
|------|-----------|
| `qkrpc.mdc` | `~/.cursor/rules/` (setup), `cursor-plugin/quicker-rpc/rules/` (sync, gitignored) |
| `claude-qkrpc.md` | `~/.claude/CLAUDE.md` merge |
| `codex-qkrpc.md` | project `AGENTS.md` merge (`--project`) |

Repo `.cursor/rules/qkrpc.mdc` should match `qkrpc.mdc` here; if diverged, copy from this directory.

Do **not** duplicate authoring skills under `.cursor/skills/` in this monorepo — use user-level `qkrpc agent setup --upgrade` (see `AGENTS.md`).

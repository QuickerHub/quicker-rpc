# Generated plugin assets (not in Git)

`skills/` and `rules/` are **build outputs**, not sources of truth.

| Source (edit here) | Generated into |
|--------------------|----------------|
| `docs/skills/<name>/` | `cursor-plugin/quicker-rpc/skills/<name>/` |
| `docs/agent-rules/qkrpc.mdc` | `cursor-plugin/quicker-rpc/rules/qkrpc.mdc` |

Static assets (committed): `cursor-plugin/quicker-rpc/assets/logo.svg` (+ `logo.png` fallback); referenced in `.cursor-plugin/plugin.json` as `logo`.

```powershell
pwsh -NoProfile -File ./scripts/sync-cursor-plugin.ps1
pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1   # runs sync automatically
```

User install: `qkrpc agent setup` or `qkrpc agent setup --upgrade` (Cursor plugin).

# Generated plugin assets (not in Git)

`skills/` are **build outputs**, not sources of truth.

| Source (edit here) | Generated into |
|--------------------|----------------|
| `docs/skills/<name>/` | `codex-plugin/quicker-rpc/skills/<name>/` |
| `cursor-plugin/quicker-rpc/assets/` | `codex-plugin/quicker-rpc/assets/` (sync script) |

```powershell
pwsh -NoProfile -File ./scripts/sync-codex-plugin.ps1
pwsh -NoProfile -File ./scripts/install-codex-plugin.ps1
```

User install: `qkrpc agent setup --codex` or `qkrpc agent setup --codex-plugin`.

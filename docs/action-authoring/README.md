# Action authoring guides

| Path | Audience |
|------|----------|
| [`action-authoring-src/`](action-authoring-src/) | **Edit here** — templates + `ops.json` registry |
| [`action-authoring/cli/`](action-authoring/cli/) | Generated for `qkrpc guide` (embedded in AgentModel) |
| [`skills/quicker-authoring/`](../skills/quicker-authoring/) | Generated [Agent Skills](https://agentskills.io/specification) for QuickerAgent (`docs_get`) |

## Regenerate

```powershell
# from repo root
node scripts/generate-authoring-docs.mjs
pwsh scripts/Generate-ActionAuthoringDocs.ps1
npm run docs:gen          # package.json at repo root
npm run docs:check        # CI: fail if cli/ or skills/ stale

# agent-gui (predev/prebuild run docs:gen automatically)
cd agent-gui && pnpm docs:gen
```

**Automatic hooks**

| Trigger | Skip when unchanged? |
|---------|----------------------|
| `node scripts/generate-authoring-docs.mjs` | Yes — mtime precheck, then content compare |
| `dotnet build QuickerRpc.AgentModel` | Yes — MSBuild skips target if stamp ≥ sources; script skips if outputs match |
| `build.ps1` / `agent-gui` predev/prebuild | Same as `docs:gen` |
| `npm run docs:check` (CI) | N/A — fails if would need regen |

Force rewrite: `npm run docs:gen:force` or `--force`.

Edit templates under `action-authoring-src/`, not the `cli/` or `skills/` outputs. Commit regenerated `cli/` and `skills/` with template changes.

## Consumers

| Project | Reads |
|---------|--------|
| `QuickerRpc.AgentModel` | `action-authoring/cli/*.md` (build embed) |
| `agent-gui` | `skills/quicker-authoring/*/SKILL.md` (runtime) |
| Terminal / Cursor | `qkrpc guide get` after CLI rebuild |

Topic id = skill `name` = directory name (e.g. `authoring-workflow`).

# Action authoring guides

| Path | Audience |
|------|----------|
| [`action-authoring-src/`](action-authoring-src/) | **Edit here** — templates + `manifest/*.json` registry |
| [`action-authoring/cli/`](action-authoring/cli/) | Generated for `qkrpc guide` (embedded in AgentModel) |
| [`skills/quicker-authoring/`](../skills/quicker-authoring/) | Generated single [Agent Skill](https://agentskills.io/specification) + `references/` for QuickerAgent (`docs_get`) |

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

**Do not edit module bodies under `cli/references/step-modules/`** — runtime embeds from [`authoring-references/`](../authoring-references/). See [authoring/PIPELINE.md](../authoring/PIPELINE.md).

## Consumers

| Project | Reads |
|---------|--------|
| `QuickerRpc.AgentModel` | `action-authoring/cli/*.md` (build embed) |
| `agent-gui` | `skills/quicker-authoring/SKILL.md`, `references/*.md`, `topics.json` (runtime) |
| Terminal / Cursor | `qkrpc guide get` after CLI rebuild |

Topic id = `docs_get` topic (e.g. `authoring-workflow`); router reads root `SKILL.md`, `overview` and other topics read `references/{topic}.md`.

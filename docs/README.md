# quicker-rpc documentation

| Path | Audience |
|------|----------|
| [cli-commands.md](cli-commands.md) | Human / Agent CLI reference |
| [action-authoring-src/](action-authoring-src/) | **Source** templates + `ops.json` (CLI vs agent-ui) |
| [action-authoring/](action-authoring/) | Generated `cli/` outputs |
| [skills/quicker-authoring/](skills/quicker-authoring/) | Generated Agent Skills for QuickerAgent |

Edit **`action-authoring-src/`** only. Regenerate: `npm run docs:gen` or `node scripts/generate-authoring-docs.mjs` (also runs on `dotnet build QuickerRpc.AgentModel`, `build.ps1`, `agent-gui` predev/prebuild). CI: `npm run docs:check`.

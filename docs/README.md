# quicker-rpc documentation

| Path | Audience |
|------|----------|
| [cli-commands.md](cli-commands.md) | Human / Agent CLI reference |
| [voice-input-plugin.md](voice-input-plugin.md) | QuickerAgent optional local voice input — product design + WebSocket protocol v1 |
| [action-authoring-src/](action-authoring-src/) | **Source** templates + `ops.json` (CLI vs agent-ui) |
| [action-authoring/](action-authoring/) | Generated `cli/` outputs |
| [skills/quicker-authoring/](skills/quicker-authoring/) | Generated single Agent Skill (`SKILL.md` + `references/`) for QuickerAgent |

Edit **`action-authoring-src/`** only. Regenerate: `npm run docs:gen` or `node scripts/generate-authoring-docs.mjs` (also runs on `dotnet build QuickerRpc.AgentModel`, `build.ps1`, `agent-gui` predev/prebuild). CI: `npm run docs:check`.

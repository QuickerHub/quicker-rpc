# QuickerRpc.AgentModel

Agent-facing Quicker models and XAction program logic (compression, patch, StepRunner catalog).

- **No** MCP, StreamJsonRpc, or Quicker.exe dependencies.
- Migrated from `quickerorg/Quicker/QuickerPc/Quicker.Mcp` (compression/patch/resolvers).

## Layout

| Path | Role |
|------|------|
| `Catalog/` | Neutral `StepRunnerCatalog` + agent schema/search DTOs |
| `Core/` | `AgentJson` (JsonElement ↔ JObject) |
| `Guides/` | `ActionAuthoringGuideService` — embeds generated `docs/action-authoring/cli/` |
| `XAction/Compression/` | `XActionCompressor` |
| `XAction/Patch/` | `XActionPatchApplier`, step/variable resolvers |
| `XAction/XActionProgramService.cs` | Facade entry points |

## Shared with quickerorg

`Quicker.Mcp` (Designer Host HTTP MCP) references this project:

```text
quickerorg/Quicker/QuickerPc/Quicker.Mcp  →  ../../../../quicker-rpc/QuickerRpc.AgentModel
```

- **Single source**: compression, patch, step-runner schema DTOs (`QuickerRpc.AgentModel.Catalog` / `.XAction`).
- **Host-only**: `Quicker.Mcp/Catalog/StepRunnerCatalogFromGrpc.cs` maps gRPC → `StepRunnerCatalog`.
- **Host-only**: `McpStepCatalogMapper.Search` still uses Designer `StepQuickInsertCatalog` (pinyin / `|` / `*`).
- **Agent step-runner search**: curated `Catalog/step-runner-agent-keywords.json` + `StepRunnerKeywordSearch` (`keywords`, per-control `controlKeywords`, `controlRankBias`; sync via `QuickerRpc.Plugin.Test/scripts/sync-control-keywords.py`).

## Next steps

- Plugin: headless editing via `qkrpc action get/patch/replace` + `HeadlessActionProgramService`

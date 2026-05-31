# QuickerRpc.AgentModel

Agent-facing Quicker models and XAction program logic (compression, patch, StepRunner catalog).

- **No** MCP, StreamJsonRpc, or Quicker.exe dependencies.
- Migrated from `quickerorg/Quicker/QuickerPc/Quicker.Mcp` (compression/patch/resolvers).

## Layout

| Path | Role |
|------|------|
| `Catalog/` | Neutral `StepRunnerCatalog` + agent schema/search DTOs |
| `Core/` | `AgentJson` (JsonElement ↔ JObject) |
| `Docs/ActionAuthoring/` | Embedded Markdown guides for MCP agents (`guide_get` / `guide_search`) |
| `Guides/` | `ActionAuthoringGuideService` (loads embedded topics) |
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

## Next steps

- Plugin: headless MCP via `qkrpc mcp` + `HeadlessActionProgramService`
- Port advanced `step_runner_search` (| OR, * wildcards) into AgentModel (optional)

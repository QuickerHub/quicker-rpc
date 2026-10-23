# QuickerRpc.AgentModel

Agent-facing Quicker models and XAction program logic (YAML source, native V1 conversion, compression, patch, StepRunner catalog).

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
| `XAction/Source/` | `ProgramSourceCodec`, CAW normalization and `V1ProgramSourceCodec` |
| `XAction/Project/` | Legacy JSON projects and resource-file compilation |
| `XAction/XActionProgramService.cs` | Facade entry points |

## YAML source and V1 native data

`ProgramSourceCodec` ports the source syntax from Quicker's `Quicker.Ai.Workspace`;
each ported file records its upstream revision. It supports canonical agent wire
(CAW), control-flow and call sugar, and explicit value/file/variable bindings.
It has no runtime dependency on the Quicker application repository.

```text
V1 native snapshot + saved CAW checkpoint
  ↔ V1ProgramSourceCodec
  ↔ CAW
  ↔ ProgramSourceCodec
  ↔ program.source.yaml
```

`FromNative` exports without protobuf projection. `NormalizeForSave` assigns
embedded-subprogram identities; `ToNative` merges source changes with both saved
checkpoints to preserve unknown fields, native IDs and parameter metadata across
reorders and repeated saves. File bindings must be materialized before conversion.
Do not route this workflow through compressed DTOs: their fixed schema can discard
native fields. Disk checkpoints and host calls belong to Console and Plugin adapters.

## Consumers and knowledge

- V1 source editing: Console `action open/save` and the native source host port.
- Legacy editing: `XActionProgramService` compression/patch and Runtime handlers.
- Step discovery: `Catalog/step-runner-agent-keywords.json` and `StepRunnerKeywordSearch`.
- Authoring guides: generated from [the knowledge pipeline](../../../docs/authoring/README.md), then embedded by this project.
- Layer boundaries and validation: [core architecture](../../../docs/design/quicker-rpc-core-architecture.md).

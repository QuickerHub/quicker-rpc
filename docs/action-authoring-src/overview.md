# {{#topic-title}}

{{#ref product.intro}}

## How to use these guides

{{#include-partial doc-layers-table}}

**Existing V1 action via CLI/MCP or QuickerAgent**: open → edit `program.source.yaml` / `files/` → save dry-run → save. Read **program-source** first. QuickerAgent tools require explicit `dryRun: true` then `false`, operate within sidebar cwd, and preserve tool-managed sidecars. V2 uses its native MCP.

**Creation / global subprogram / compatibility JSON path**: create or get (non-empty) → workspace_program edit data.json/files → patch. Metadata retains existing commands. After create NO re-get. NO inline patch JSON on workspace path. CLI JSON patch remains available (patch-workflow).

## P0

{{#ref overview.p0}}

{{#only-cli}}
```powershell
{{@ help}}
{{@doc authoring-workflow}}
```
{{/only-cli}}
{{#only-agent}}
| tool | use |
|------|-----|
| docs index | topic list by layer |
| docs get | one topic deep-read |
| docs search | keyword lookup |
{{/only-agent}}

## Pipeline P0–P7

{{#include-partial pipeline-p0-p7}}

Walkthrough: **authoring-workflow**. Workspace: **workspace-editing**.

## Topic index

### Workflows

{{#include-partial topic-index-workflows}}

### Schemas

{{#include-partial topic-index-schemas}}

### Catalogs

{{#include-partial topic-index-catalogs}}

| topic | when |
|-------|------|
| quicker-ui | open Quicker settings/UI (not program body) |

## Common errors ({{#ref errors.source}})

{{#include-partial errors-table}}

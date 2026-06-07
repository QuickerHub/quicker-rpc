# {{#topic-title}}

{{#ref product.intro}}

## How to use these guides

{{#include-partial doc-layers-table}}

**Default path (workspace)**: create or get (non-empty) → workspace_program edit data.json/files → patch. After create NO re-get. NO inline patch JSON on workspace path.

**CLI alternative**: `action get` → `step-runner get` → `action patch --patch-file` (patch-workflow).

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

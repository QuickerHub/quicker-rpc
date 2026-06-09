# Overview

Headless XAction via agent tools + QuickerRpc plugin. Route/hard rules preloaded; params in tool descriptions. Deep-read: docs get — do not paste guides in replies.

## How to use these guides

| layer | content |
|-------|---------|
| **tool / command description** | param names, returns, constraints (authoritative) |
| **workflow docs** | P0–P7 order, workspace vs CLI patch (authoring-workflow, workspace-editing); publish (action-publish-workflow) |
| **file schemas** | **action-data-schema** (data.json JSON + wire rules), expressions, action-project-files |
| **CLI-only** | patch-workflow (inline patch JSON) |

**Default path (workspace)**: create or get (non-empty) → workspace_program edit data.json/files → patch. After create NO re-get. NO inline patch JSON on workspace path.

**CLI alternative**: `action get` → `step-runner get` → `action patch --patch-file` (patch-workflow).

## P0

Quicker + plugin + qkrpc serve. On fail: tell user; no shell connectivity workarounds. Guides via docs tool — never qkrpc guide.

| tool | use |
|------|-----|
| docs index | topic list by layer |
| docs get | one topic deep-read |
| docs search | keyword lookup |

## Pipeline P0–P7

```text
Ph  Goal
──  ─────────────────────────────────────────
P0  Quicker + plugin; cwd / connectivity
P1  actionId (create / query / search)
P2  sync workspace (get → .quicker/actions/{id}/)
P3  metadata optional (set_metadata)
P4  pick impl: expressions first → module → csscript
P5  per step: step_runner_search → get (NO guess keys)
P6  edit data.json / files/ → save (patch or --patch-file)
P7  trust editVersion after save (NO verify re-get)
```

Walkthrough: **authoring-workflow**. Workspace: **workspace-editing**.

## Topic index

### Workflows

| title | topic | when |
|-------|-------|------|
| Action authoring | **`authoring-workflow`** | P1–P7 main flow |
| Workspace editing | **`workspace-editing`** | `.quicker` layout, workspace tools, file externalize |
| Subprograms | **`subprogram-workflow`** | global vs embedded |
| Action organization | **`action-organization-workflow`** | move actions, tabs — not program body |
| Action publish | **`action-publish-workflow`** | share/update getquicker — after P1–P7 |

### Schemas

| title | topic | when |
|-------|-------|------|
| Action data.json schema | **`action-data-schema`** | P2–P6: steps[] + variables[] JSON and wire rules |
| Expressions | **`expressions`** | P4 default: $=, $$, sys:evalexpression |
| Implementation fallback | **`implementation-fallback`** | P4 when no dedicated module |
| Action icons | **`action-icons`** | P3 metadata/menu fa: spec; fa search |
| Context menu items | **`common-operation-item`** | P3 ContextMenuData |
| Project files | **`action-project-files`** | .quicker/actions layout, file refs |
| Form spec | **`form-spec`** | sys:form + files/*.form.json |
| WebView2 | **`webview2-authoring`** | sys:webview2 + files/*.html |
| Embedded subprograms | **`action-embedded-subprograms`** | subprograms/{subId}/ disk model |

### Catalogs

| title | topic | when |
|-------|-------|------|
| Step-runner search | **`step-runner-search`** | P5: find key + controlField |
| Step-runner get | **`step-runner-get`** | P5: inputParams keys before write |
| Step-runner catalog | **`step-runner-catalog`** | browse modules (optional) |

| topic | when |
|-------|------|
| quicker-ui | open Quicker settings/UI (not program body) |

## Common errors (tool errorMessage / stderr)

| `value` / inline `defaultValue` has `{var}` but not `$$`/`$=` | no runtime expand; use `$$`/`$=` or varKey (**expressions**) |
| guess inputParams keys | keys must match step-runner schema (**step-runner-get**) |
| long script in `value` | >~4 lines → `paramKey.file` + files/ (**action-data-schema**) |
| outputParams as `{ "varKey": "…" }` | use string `"outputKey": "clipText"` (dictVar.key ok) — **action-data-schema** |
| deprecated `defaultValueFile` / `defaultValue` object | `default` / `default.file` wire (**action-data-schema**) |
| guess callIdentifier / icon spec | from subprogram def / fa search (**subprogram-workflow**, **action-icons**) |

| re-get after save | trust patch **editVersion** (authoring-workflow P7) |
| publish without changelog on shared action | pass **changelog** — **action-publish-workflow** Pub4 |
| public share icon rejected | custom fa:Light_* or image URL — **action-icons**, Pub1 |
| user wants HTML 动作说明 | built-in publish automation — Agent STOP; draft Pub3 `note` only — **action-publish-workflow** Pub5 |

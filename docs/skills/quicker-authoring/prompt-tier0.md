# Skill: action authoring (quicker-authoring)

Headless XAction via agent tools + QuickerRpc plugin. Route/hard rules preloaded; params in tool descriptions. Deep-read: docs get — do not paste guides in replies.

## Route (authoring only — run/settings/layout → main agent Capabilities)

| intent | tools | docs deep-read |
|--------|-------|----------------|
| run / debug / float | qkrpc_action_run / debug / float | — |
| edit program body | P1–P7 + workspace_program | authoring-workflow |
| disk .quicker | workspace_program | workspace-editing |
| global/embedded subprogram | workspace_program + target | subprogram-workflow |
| step module keys | qkrpc_step_runner_search → get | step-runner-get |
| metadata icons | qkrpc_fa search | action-icons |
| publish / update share | qkrpc_action_publish | action-publish-workflow |
| auto-run on event / trigger | quicker_trigger | trigger-workflow |
| WebView2/HTML in files/ | workspace_program file_* + patch | webview2-authoring |

## Scenario skills

On-demand — full route table in parent **quicker-authoring** SKILL (`Scenario skills`). Hot: library-search, selection/clipboard pipeline, subprogram `var:*`, run-action-delegate, form-param-input.

## Pattern traps (do not guess)

- Library/shared: **read-only**; local write → `action create`
- Subprogram IO: **`var:<key>`** — not `text.var`
- `each`/`repeat` children: **`ifSteps`**; single branch: **`simpleIf`**
- `checkPathExists` → **`isExists`**; `simpleIf` **`$=`** / expr **`{var}`**
- `runAction` output: **`wait: True`** + `StartAction` get
- `sys:form`: long defs → **`formDef.file`**; headless trace **exempt** (UI)
- `regexExtract` → **`match1 `** (trailing space); `simpleIf` else+http → **`sys:if`**
- `windowOperations` maximize: **`type: show`** + **`showCmd: 3`**
- long evalexpression: **`expression.file`** → `files/*.eval.cs` + **apply**
- number var assign: **`Convert.ToDouble(n)`**; separate **`parseOk`** from `clipOk`

## P0–P7

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

## Hard rules

- NO shell_exec for qkrpc connectivity (ping, probe, serve, build.ps1 -t, qkrpc CLI) — tell user on connectivity_failure
- Search before guess (see system Search-first); docs search → items[].snippet; docs get(topic) only for full workflow
- NO guess inputParams without step_runner_search → get
- NO get-ui / step-runner.getUi
- NO inline program-body patch / whole-program `--patch-file`; step `inputParams` literals per get
- After patch trust editVersion; NO re-get to verify
- P4: **sys:assign** single-var; **`$=`/`$$`/evalexpression** rules in preloaded **quicker-eval-expression** below; module → csscript last

## Workspace

### Model

Workspace = sidebar cwd. Projects under `.quicker/`; workspace_program read/write disk; patch → Quicker.

```text
Quicker DB ←—— patch ——→ .quicker/actions|subprograms/
           ←—— get (non-empty) ——  extract to disk
```

### Files

| file | role |
|------|------|
| info.json | title, icon, editVersion, callIdentifier (subprogram) |
| data.json | steps[] + variables[] only — **action-data-schema**; agents omit stepId, empty ifSteps/elseSteps |
| files/ | long scripts/HTML; step ref `paramKey.file`: `files/…` |

### target → disk

| target | id | root |
|--------|-----|------|
| action | action GUID | .quicker/actions/{id}/ |
| global_subprogram | subprogram id/name | .quicker/subprograms/{id}/ |
| embedded_subprogram | parent GUID + subProgramId | .quicker/actions/{id}/subprograms/{subProgramId}/ |

### workspace_program ops

| action | use |
|--------|-----|
| projects_list | list local .quicker projects |
| read_data / write_data / edit_data | data.json (NOT file_* for data.json) |
| file_* | path files/… external assets |
| patch | disk → Quicker (only save path; NO --patch-file / inline op JSON) |
| diagnostics | post-patch syntax lint |

### Sync

- **new**: create → empty data.json on disk → edit → patch (NO re-get)
- **existing non-empty**: get → read/edit → [file_*] → patch
- **discover**: projects_list; `<qka id="guid">` → get then edit

Deep-read: workspace-editing.

## Steps & file externalization

steps[] + inputParams: `paramKey` · `.file` · `.var` (one bind/key). **Literal `value` may be JSON string / number / boolean / array / object** per `step_runner_get` `valueType` — not only strings; expr still uses `$$`/`$=`.

| intent | write | NOT |
|--------|-------|-----|
| var bind | `paramKey.var` | `"paramKey":"{varKey}"` |
| text + var | `$$…{varKey}…` on `paramKey` | `paramKey.var` |
| list/dict literal | `["a"]` / `{"k":1}` on `paramKey` | multiline guess |
| enum/literal | pick from step_runner_get `options` | guess value |

Long text → `paramKey.file`. Keys: search → get. Branch: sys:if → ifSteps/elseSteps. Deep-read: **action-data-schema**, step-runner-get.

Topic index below; deep-read via docs search (snippet). Full workflow → docs get(topic).

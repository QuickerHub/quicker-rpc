# Skill: action authoring (quicker-authoring)

Headless XAction via agent tools + QuickerRpc plugin. Route/hard rules preloaded; params in tool descriptions. Deep-read: docs get — do not paste guides in replies.

## Route (authoring only — run/settings/layout → main agent Capabilities)

| intent | tools | docs deep-read |
|--------|-------|----------------|
| edit program body | P1–P7 | authoring-workflow |
| disk .quicker | workspace_program | workspace-editing |
| global/embedded subprogram | workspace_program + target | subprogram-workflow |
| step module keys | step_runner_search → get | step-runner-get |
| metadata icons | qkrpc_fa search | action-icons |
| WebView2/HTML in files/ | workspace_program file_* + patch | webview2-authoring |

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

- NO guess inputParams without step_runner_get
- NO get-ui / step-runner.getUi
- NO inline patch JSON / --patch-file; save via workspace_program patch only
- After patch trust editVersion; NO re-get to verify
- P4: expressions / sys:evalexpression → dedicated module → csscript last

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
| data.json | steps[] + variables[] only |
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
| diagnostics | post-patch expr/C# syntax lint |

### Sync

- **new**: create → empty data.json on disk → edit → patch (NO re-get)
- **existing non-empty**: get → read/edit → [file_*] → patch
- **discover**: projects_list; `<qka id="guid">` → get then edit

Deep-read: workspace-editing.

### Checklist

```text
- [ ] target + id (+ subProgramId?) matches disk path
- [ ] non-empty body: get before edit; after create NO re-get
- [ ] data.json: read_data / edit_data / write_data (NOT file_* on data.json)
- [ ] long script (>4 lines): `paramKey.file` → files/
- [ ] save: workspace_program patch OR CLI --patch-file (pick one path)
- [ ] post-patch: trust editVersion; optional diagnostics
```

## Steps & file externalization

data.json inputParams wire: `paramKey` (literal) · `paramKey.file` · `paramKey.var` — plain string values only.

| case | do |

|------|-----|

| long script/HTML | `paramKey.file` → files/ |

| step keys | step_runner search → get; NO guessing |

| branch | sys:if → ifSteps / elseSteps |

Deep-read: action-steps, expressions, step-runner-get.

NO multi docs get at session start; topic index is in system prompt below.

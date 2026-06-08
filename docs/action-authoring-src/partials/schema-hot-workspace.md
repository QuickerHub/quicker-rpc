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

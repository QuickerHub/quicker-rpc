# Workspace editing

**When**: P2/P6 before editing data.json or files/. Hot model in prompt-tier0; params in workspace_program tool.

### Checklist

```text
- [ ] target + id (+ subProgramId?) matches disk path
- [ ] non-empty body: get before edit; after create NO re-get
- [ ] data.json: read_data / edit_data / write_data (NOT file_* on data.json)
- [ ] long script (>4 lines): `paramKey.file` → files/
- [ ] save: workspace_program patch OR CLI --patch-file (pick one path)
- [ ] post-patch: trust editVersion; optional diagnostics
```

## Model

Sidebar cwd = project root. `.quicker/`: info.json · data.json (steps+vars) · files/.

```text
Quicker ←—— patch ——→ .quicker/actions|subprograms/
        ←—— get (non-empty) —— extract
```

After create: info.json exists; empty body → get skips data.json.

## target

| target | id | path |
|--------|-----|------|
| action | GUID | .quicker/actions/{id}/ |
| global_subprogram | id/name | .quicker/subprograms/{id}/ |
| embedded_subprogram | parent + subProgramId | .quicker/actions/{id}/subprograms/{subProgramId}/ |

## workspace_program ops

| action | use |
|--------|-----|
| projects_list | list projects |
| read_data / write_data / edit_data | data.json only |
| file_* | files/… |
| patch | disk → Quicker (ONLY save) |
| diagnostics | post-patch syntax |

## Flows

- new: create → edit → patch (NO re-get)
- existing: get → read/edit → [file_*] → patch
- global sub: subprogram get → edit (global_subprogram) → patch
- embedded: action get → edit (embedded_subprogram) → patch

## Long content

>4 lines → `paramKey.file`. Large files: read slice → file_edit. Trust editVersion after patch.

## CLI patch path

CLI/scripts may use `action patch --patch-file` inline JSON (patch-workflow) instead of workspace_program disk flow.

## FORBIDDEN (workspace path)

--patch-file when using workspace_program · file_* on data.json · absolute .quicker paths · re-get to verify

## See also

authoring-workflow · subprogram-workflow · action-steps · patch-workflow (CLI)

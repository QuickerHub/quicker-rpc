# Workspace editing

**Existing V1 action via standalone CLI/MCP**: use **program-source** (`open` → YAML/files → `save`) by default.

**Below**: legacy JSON projects and QuickerAgent's `workspace_program` workflow.
Use before editing `data.json` or its `files/`; params are in workspace_program tools.

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

## Disk editing (who edits files)

| Host | How to edit data.json / files/ |
|------|--------------------------------|
| **QuickerAgent** | `workspace_program` read_data / edit_data / file_* |
| **Third-party MCP compatibility projects** | Host **Read / Write / StrReplace** on paths under `.quicker/` — MCP has **no** file tools. New existing-action edits use **program-source** bundles instead. |

Layout: MCP resource `quicker://workspace/readme`, `quicker://workspace/index`, or `docs` topic **workspace-editing**.

## workspace_program ops

| action | use |
|--------|-----|
| projects_list | list projects |
| reindex | refresh index.json |
| patch | disk → Quicker (ONLY save) |
| validate | pre-patch checks |
| diagnostics | post-patch syntax |

QuickerAgent also: read_data / write_data / edit_data / file_* (not exposed on third-party MCP).

## Flows

- new: create → host file edit → patch (NO re-get)
- existing: get → host file edit → patch
- global sub: subprogram get → edit disk → patch
- embedded: action get → edit embedded path → patch

## Long content

>4 lines → `paramKey.file`. Large files: read slices with host file tools. Trust editVersion after patch.

## CLI patch path

CLI/scripts may use `action patch --patch-file` inline JSON (patch-workflow) instead of workspace_program disk flow.

## FORBIDDEN (workspace path)

--patch-file when using disk workflow · absolute paths outside workspace · re-get to verify after patch

## See also

authoring-workflow · subprogram-workflow · action-data-schema · patch-workflow (CLI)

# Action authoring workflow

**When**: create/edit action program body — follow P1–P7. Disk: workspace-editing. CLI inline patch: patch-workflow.

## Checklist (P1–P7)

```text
- [ ] P0  Quicker + plugin; cwd
- [ ] P1  actionId (create / query / search)
- [ ] P2  get/extract → .quicker/… (workspace-editing)
- [ ] P3  metadata optional (action-icons)
- [ ] P4  expressions first → module → csscript
- [ ] P5  each step: search → get (NO guess keys)
- [ ] P6  edit data.json / files/ → patch
- [ ] P7  trust editVersion; NO verify re-get
```

## P0 Prerequisites

- Quicker + plugin loaded.
- 
- Sidebar cwd. Header = RPC status; no ping tool.

## P1 Locate actionId

| scenario | tool |
|----------|------|
| new | qkrpc_action_create({ info: { title: "MyAction", description?: "…", icon?: "fa:Light_*" } }) → actionId, editVersion, workspaceProject |
| existing | qkrpc_action_list({ query: "keyword", scope?: "agent" }) / qkrpc_action_search({ query: "name", scope?: "agent" }) |

Note **actionId** (GUID). `<qka id="…">` uses that id. After create **NO re-get** → edit disk → patch.

## P2 Read & workspace

1. Existing action (non-empty): get → `.quicker/actions/{id}/`
2. Existing subprogram (non-empty): subprogram get → `.quicker/subprograms/{id}/`
3. Empty body: get skips data.json; write_data|edit_data first
4. List local: workspace_program projects_list

See workspace-editing for targets.

## P3 Metadata (optional)

Title/description/icon only:

```text
qkrpc_action_set_metadata({ id: "<guid>", icon: "fa:Light_<Name>", expectedEditVersion: <N> })
```

Icons: fa search. Context menus: common-operation-item.

## P4 Implementation pick

Read expressions + implementation-fallback. expressions/evalexpression first → dedicated modules → webview2 → csscript last.

## P5 Step schema (each step)

```text
step_runner_search → step_runner_get (required)
```

Long value (>4 lines): `paramKey.file` → files/. controlField from search → pass on get.

```text
qkrpc_step_runner_search({ query: "clipboard|sys:*clip*" })
qkrpc_step_runner_get({ key: "sys:MsgBox" })
```

## P6 Write

Prefix rules: expressions. Edit data.json/files/ → workspace_program patch. NO --patch-file on workspace path.

## P7 After save

Trust editVersion / projectSummary; NO verify re-get. Agent: brief reply; UI shows patch shortcut card.

## Related

overview · workspace-editing · action-variables · action-steps · expressions · subprogram-workflow · step-runner-search

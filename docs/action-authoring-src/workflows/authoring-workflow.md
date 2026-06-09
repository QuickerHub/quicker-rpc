# {{#topic-title}}

**When**: create/edit action program body — follow P1–P7. Disk: workspace-editing. CLI inline patch: patch-workflow.

{{#include-partial workflow-checklist-p1-p7}}

## P0 Prerequisites

- Quicker + plugin loaded.
- {{#only-cli}}Connectivity: command stderr; `qkrpc help --json`, `qkrpc guide get --topic overview`.{{/only-cli}}
- {{#only-agent}}Sidebar cwd. Header = RPC status; no ping tool.{{/only-agent}}

## P1 Locate actionId

| scenario | {{#ref table.invoke.header}} |
|----------|------|
| new | {{@ action.create}} → actionId, editVersion, workspaceProject |
| existing | {{@ action.list}} / {{@ action.search query=name}} |

Note **actionId** (GUID). `<qka id="…">` uses that id. After create **NO re-get** → edit disk → patch.

## P2 Read & workspace

1. Existing action (non-empty): get → `.quicker/actions/{id}/`
2. Existing subprogram (non-empty): subprogram get → `.quicker/subprograms/{id}/`
3. Empty body: get skips data.json; write_data|edit_data first
4. List local: workspace_program projects_list

See workspace-editing for targets.

## P3 Metadata (optional)

Title/description/icon only:

{{#only-cli}}```powershell
{{@ action.set-metadata}}
```{{/only-cli}}
{{#only-agent}}```text
{{@ action.set-metadata}}
```{{/only-agent}}

Icons: fa search. Context menus: common-operation-item.

## P4 Implementation pick

Read expressions + implementation-fallback. expressions/evalexpression first → dedicated modules → webview2 → csscript last.

## P5 Step schema (each step)

```text
step_runner_search → step_runner_get (required)
```

Long value (>4 lines): `paramKey.file` → files/. controlField from search → pass on get.

{{#only-cli}}```powershell
{{@ step-runner.search}}
{{@ step-runner.get}}
```{{/only-cli}}
{{#only-agent}}```text
{{@ step-runner.search}}
{{@ step-runner.get}}
```{{/only-agent}}

## P6 Write

{{#only-agent}}
Prefix rules: expressions. Edit data.json/files/ → workspace_program patch. NO --patch-file on workspace path.
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ action.patch}}
```
Or `--patch-file` inline JSON — patch-workflow.
{{/only-cli}}

## P7 After save

Trust editVersion / projectSummary; NO verify re-get. Agent: brief reply; UI shows patch shortcut card.

## Related

overview · workspace-editing · action-data-schema · expressions · subprogram-workflow · step-runner-search · action-publish-workflow

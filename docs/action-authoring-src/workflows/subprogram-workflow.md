# {{#topic-title}}

**When**: manage global subprograms or call from actions.

{{#include-partial workflow-checklist-subprogram}}

## Concepts

| | global | embedded |
|--|--------|----------|
| storage | global lib | parent SubPrograms[] |
| disk | .quicker/subprograms/{id}/ | .quicker/actions/{aid}/subprograms/{sid}/ |
| call | sys:subprogram + %%{guid} | in-parent id |

## A. Manage global

```text
subprogram search/get → workspace_program edit → patch
```

| step | {{#ref table.invoke.header}} |
|------|------|
| search/read | subprogram search/get |
| create | subprogram create |
| edit | workspace_program read/edit (global_subprogram) |
| save | workspace_program patch |

{{#only-cli}}CLI may use `subprogram patch --patch-file` instead of workspace path.{{/only-cli}}

## B. Call from action

```text
subprogram get → callIdentifier → step_runner_get(sys:subprogram) → edit step → patch
```

{{#ref subprogram.call.chain}}

## Related

authoring-workflow · workspace-editing · overview

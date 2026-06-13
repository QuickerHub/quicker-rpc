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

**IO params**: `isInput` / `isOutput` + `paramName` on variables[]; per-param UI/binding options (`isRequired`, `selectionItems`, `isAdvanced`, `visibleExpression`, `skipEval` = pass value verbatim without `{var}` / `$$` / `$=` parsing) in `inputParamInfo` / `outputParamInfo` — see **action-data-schema**.

**Reference lookup** (same query prefixes as action list/search): `subprogram search` query `uses:<idOrName>` finds global subprograms calling the target; `uses-only:<idOrName>` = dedicated wrappers; `source:published|local` and `shared:<sharedId>` filter by share state. Actions calling a subprogram: `action search` query `uses:<idOrName>`.

## B. Call from action

```text
subprogram get → callIdentifier → step_runner_get(sys:subprogram) → edit step → patch
```

{{#ref subprogram.call.chain}}

## Related

authoring-workflow · workspace-editing · overview

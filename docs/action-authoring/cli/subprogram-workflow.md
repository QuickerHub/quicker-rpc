# Subprograms

**When**: manage global subprograms or call from actions.

## Checklist

### A. Manage global subprogram

```text
- [ ] subprogram query/get → callIdentifier, editVersion
- [ ] workspace_program edit .quicker/subprograms/…/data.json (+ files/)
- [ ] workspace_program patch (target=global_subprogram)
- [ ] NO subprogram patch --patch-file on workspace path
```

### B. Call from action

```text
- [ ] subprogram get → callIdentifier (%%{guid})
- [ ] step_runner_get sys:subprogram — NO guess inputParams
- [ ] workspace_program edit_data step → patch (target=action)
```

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

| step | command |
|------|------|
| search/read | subprogram search/get |
| create | subprogram create |
| edit | workspace_program read/edit (global_subprogram) |
| save | workspace_program patch |

CLI may use `subprogram patch --patch-file` instead of workspace path.

**IO params**: `isInput` / `isOutput` + `paramName` on variables[]; per-param UI/binding options (`isRequired`, `selectionItems`, `isAdvanced`, `visibleExpression`, `skipEval` = pass value verbatim without `{var}` / `$$` / `$=` parsing) in `inputParamInfo` / `outputParamInfo` — see **action-data-schema**.

**Reference lookup** (same query prefixes as action list/search): `subprogram search` query `uses:<idOrName>` finds global subprograms calling the target; `uses-only:<idOrName>` = dedicated wrappers; `source:published|local` and `shared:<sharedId>` filter by share state. Actions calling a subprogram: `action search` query `uses:<idOrName>`.

## B. Call from action

```text
subprogram get → callIdentifier → step_runner_get(sys:subprogram) → edit step → patch
```

→ `qkrpc step-runner get --key sys:subprogram` → patch: `subProgram` + IO **`var:<子程序变量key>`**（非 `text.var`）；见 authored/subprogram

## Related

authoring-workflow · workspace-editing · overview

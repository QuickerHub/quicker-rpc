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

| step | tool |
|------|------|
| search/read | subprogram search/get |
| create | subprogram create |
| edit | workspace_program read/edit (global_subprogram) |
| save | workspace_program patch |

## B. Call from action

```text
subprogram get → callIdentifier → step_runner_get(sys:subprogram) → edit step → patch
```

→ step_runner_get key=sys:subprogram → workspace_program edit_data step → patch

## Related

authoring-workflow · workspace-editing · overview

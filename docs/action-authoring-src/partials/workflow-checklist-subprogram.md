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

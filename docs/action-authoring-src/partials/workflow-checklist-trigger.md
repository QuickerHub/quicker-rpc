## Checklist (Tr0–Tr5)

```text
- [ ] Tr0  target action exists and is tested (qkrpc_action_debug) — NOT workspace_program for trigger wiring
- [ ] Tr1  action=events — read eventType, fields[].key/helpText/type/selectionItems, variables[].key
- [ ] Tr2  build params (触发条件) — keys from fields only; Text/Boolean/Integer/Enum rules below
- [ ] Tr3  optional filter ($= bool on variables) or actionParam ($$ interpolation)
- [ ] Tr4  action=add (confirm broad rules with user) — or update/delete/enable/disable by id
- [ ] Tr5  action=list to verify; bind variables[].key into action steps (e.g. tabId.var)
```

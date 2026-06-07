# {{#topic-title}}

**When**: embedded subprograms (not global `.quicker/subprograms/`) — disk layout vs Quicker `subPrograms[]`.

## vs global

| | embedded | global |
|--|----------|--------|
| owner | parent action subPrograms[] | Quicker library |
| path | actions/{actionId}/subprograms/{subId}/ | .quicker/subprograms/{name}/ |
| call | sys:subprogram + name/%%/@@ | callIdentifier — subprogram-workflow |

## Layout

```text
.quicker/actions/{actionId}/
  info.json
  data.json                 # steps + variables; NO inline subPrograms[]
  files/
  subprograms/{subProgramId}/
    info.json, data.json, files/
    subprograms/            # nested — same shape
```

Root **data.json** has no inline `subPrograms[]`; each body in **subprograms/{subId}/data.json**. Host assembles on patch. Sub files/ same rules: value / varKey / file one of; no `..`.

Logical paths:

```text
actions/{actionId}/subprograms/{subProgramId}/data.json
actions/{actionId}/subprograms/{subProgramId}/files/main.cs
```

## workspace target

`embedded_subprogram`: parent action id + subProgramId → **workspace-editing**.

## Related

subprogram-workflow · workspace-editing · action-project-files · overview

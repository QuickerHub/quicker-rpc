# {{#topic-title}}

**When**: `.quicker/actions/{actionId}/` layout or **file refs** in data.json / files/. Wire rules: **action-data-schema**.

## Layout

```text
.quicker/
  actions/{actionId}/
    info.json
    data.json             # steps + variables (embedded subs: action-embedded-subprograms)
    files/
    subprograms/{subId}/
      info.json, data.json, files/
  subprograms/{name}/     # global — subprogram-workflow
```

## file refs

| location | example (data.json wire) |
|----------|--------------------------|
| inputParams | `"script.file": "files/main.cs"` |
| variables[].default | `"default": "…"` or `"default.file": "files/…"` |

- inputParams: `paramKey` / `paramKey.file` / `paramKey.var` — action-data-schema
- variables: `default` / `default.file` — action-data-schema
- path relative to project root, `/` separators, no `..`
- body in files/

Long text → externalize; extensions e.g. `*.eval.cs` for evalexpression, `*.txt` for **sys:inputScript** `data.file` (多步骤脚本，见 step-modules/inputScript). **sys:form** formDef default **formDef.file** — form-spec.

## Related

action-data-schema · action-embedded-subprograms · overview

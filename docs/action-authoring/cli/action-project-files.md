# Workspace project layout

**When**: `.quicker/actions/{actionId}/` layout or **file refs** in data.json / files/. Step fields: **action-steps**; variable defaults: **action-variables**.

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

| variables[].defaultValue | inline string or `{ "file": "files/…" }` |

- inputParams: `paramKey` / `paramKey.file` / `paramKey.var` — action-steps

- defaultValue: inline string or file object — action-variables

- path relative to project root, `/` separators, no `..`

- body in files/

Long text → externalize; extensions e.g. `*.eval.cs` for evalexpression. **sys:form** formDef default **formDef.file** — form-spec.

## Related

action-variables · action-steps · action-embedded-subprograms · overview

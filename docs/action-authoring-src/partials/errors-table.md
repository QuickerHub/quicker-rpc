| `value` / inline `defaultValue` has `{var}` but not `$$`/`$=` | no runtime expand; use `$$`/`$=` or varKey (**expressions**) |
| guess inputParams keys | keys must match step-runner schema (**step-runner-get**) |
| long script in `value` | >~4 lines → `paramKey.file` + files/ (**action-steps**) |
| outputParams as `{ "varKey": "…" }` | use string `"outputKey": "clipText"` (dictVar.key ok) — **action-steps** |
| deprecated `defaultValueFile` / `defaultValue` object | `default` / `default.file` wire (**action-variables**) |
| guess callIdentifier / icon spec | from subprogram def / fa search (**subprogram-workflow**, **action-icons**) |

| re-get after save | trust patch **editVersion** (authoring-workflow P7) |

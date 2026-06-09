| `value` / inline `defaultValue` has `{var}` but not `$$`/`$=` | no runtime expand; use `$$`/`$=` or varKey (**expressions**) |
| guess inputParams keys | keys must match step-runner schema (**step-runner-get**) |
| long script in `value` | >~4 lines → `paramKey.file` + files/ (**action-data-schema**) |
| outputParams as `{ "varKey": "…" }` | use string `"outputKey": "clipText"` (dictVar.key ok) — **action-data-schema** |
| deprecated `defaultValueFile` / `defaultValue` object | `default` / `default.file` wire (**action-data-schema**) |
| guess callIdentifier / icon spec | from subprogram def / fa search (**subprogram-workflow**, **action-icons**) |

| re-get after save | trust patch **editVersion** (authoring-workflow P7) |
| publish without changelog on shared action | pass **changelog** — **action-publish-workflow** Pub4 |
| public share icon rejected | custom fa:Light_* or image URL — **action-icons**, Pub1 |
| user wants HTML 动作说明 | built-in publish automation — Agent STOP; draft Pub3 `note` only — **action-publish-workflow** Pub5 |

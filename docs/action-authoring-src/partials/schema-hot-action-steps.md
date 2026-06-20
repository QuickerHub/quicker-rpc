## Steps & file externalization

steps[] + inputParams: `paramKey` · `.file` · `.var` (one bind/key). **Literal `value` may be JSON string / number / boolean / array / object** per `step_runner_get` `valueType` — not only strings; expr still uses `$$`/`$=`.

| intent | write | NOT |
|--------|-------|-----|
| var bind | `paramKey.var` | `"paramKey":"{varKey}"` |
| text + var | `$$…{varKey}…` on `paramKey` | `paramKey.var` |
| list/dict literal | `["a"]` / `{"k":1}` on `paramKey` | multiline guess |
| enum/literal | pick from step_runner_get `options` | guess value |

Long text → `paramKey.file`. Keys: step_runner search → get. Branch: sys:if → ifSteps/elseSteps. Wire rules: **docs get action-data-schema** (not docs search).

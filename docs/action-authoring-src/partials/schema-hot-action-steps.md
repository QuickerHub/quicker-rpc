## Steps & file externalization

steps[] + inputParams: `paramKey` · `.file` · `.var` (one bind/key). **Literal `value` may be JSON string / number / boolean / array / object** per `step_runner_get` `valueType` — not only strings; expr still uses `$$`/`$=`.

| intent | write | NOT |
|--------|-------|-----|
| var bind | `paramKey.var` | `"paramKey":"{varKey}"` |
| text + var | `$$…{varKey}…` on `paramKey` | `paramKey.var` |
| list/dict literal | `["a"]` / `{"k":1}` on `paramKey` | multiline guess |
| enum/literal | pick from step_runner_get `options` | guess value |

Long text → `paramKey.file`. Keys: search → get. Branch: sys:if → ifSteps/elseSteps. Deep-read: **action-data-schema**, step-runner-get.

## Steps & file externalization

steps[] + inputParams: `paramKey` · `.file` · `.var` (one bind/key). Literals: string/number/bool/array/object per get; expr `$$`/`$=`.

| intent | write | NOT |
|--------|-------|-----|
| var bind | `paramKey.var` | `"paramKey":"{varKey}"` |
| text + var | `$$…{varKey}…` on `paramKey` | `paramKey.var` |
| list/dict literal | `["a"]` / `{"k":1}` on `paramKey` | multiline guess |
| enum/literal | pick from step_runner_get `options` | guess value |

Long text → `paramKey.file`. Keys: search → get. Branch: sys:if → ifSteps/elseSteps. Deep-read: **action-data-schema**, expressions, step-runner-get.

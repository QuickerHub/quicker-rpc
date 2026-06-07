## Steps & file externalization

steps[] + inputParams wire (plain strings): `paramKey` · `paramKey.file` · `paramKey.var` — one bind per paramKey.

| intent | write | NOT |
|--------|-------|-----|
| var bind | `paramKey.var` | `"paramKey":"{varKey}"` |
| text + var | `$$…{varKey}…` on `paramKey` | `paramKey.var` |
| enum/literal | pick from step_runner_get `options` | guess value |

Long text → `paramKey.file`. Keys: search → get. Branch: sys:if → ifSteps/elseSteps. Deep-read: action-steps, expressions, step-runner-get.

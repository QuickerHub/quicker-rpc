## Steps & file externalization

data.json inputParams wire: `paramKey` (literal) · `paramKey.file` · `paramKey.var` — plain string values only.

| case | do |
|------|-----|
| long script/HTML | `paramKey.file` → files/ |
| step keys | step_runner search → get; NO guessing |
| branch | sys:if → ifSteps / elseSteps |

Deep-read: action-steps, expressions, step-runner-get.

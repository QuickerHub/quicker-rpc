## inputParams (one per param key)



Workspace **data.json** wire format — **only** plain string values:



| bind | wire key | wire value |

|------|----------|------------|

| literal/expr | `paramKey` | `"…"` |

| variable | `paramKey.var` | variable key string |

| external file | `paramKey.file` | `files/…` path |



Read expands to canonical `{ value | varKey | file }` for compile/RPC; write compacts back.



Legacy objects `{ value|varKey|file }` still accepted on **read** only.



NO mixed binds; catalog keys from step_runner_get (`.file` / `.var` suffix is wire-only).



## Long text



| case | do |

|------|-----|

| value >4 lines | `paramKey.file` → files/ |

| long evalexpression | files/*.eval.cs |

| formDef / webview HTML | files/*.form.json / *.html |



## outputParams



String values = target var keys (or dict.entry). Declare variables[] first.



## Branching



sys:if — condition in inputParams; children in ifSteps/elseSteps. Single branch: sys:simpleIf.



## Rules



- step_runner_get before writing keys

- expressions/evalexpression before csscript

- externalize long content



## See also



action-variables · expressions · action-project-files · step-runner-search


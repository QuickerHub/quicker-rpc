# Expressions & interpolation
<!-- qkrpc-search-aliases: 表达式, 插值, interpolation, $=, evalexpression -->

**When**: P4 — default to $= / sys:evalexpression before dedicated steps or csscript. Keys from step_runner_get.

## Pick (P4)

Data transforms → `$=` / `sys:evalexpression` first; `sys:csscript` only for heavy .cs (implementation-fallback). No csscript Exec boilerplate — multi-statement/LINQ/implicit usings: **Z.Expressions**.

| case | do |
|------|-----|
| short text | inline `paramKey` |
| long (>4 lines) | `paramKey.file` → `files/…` or `*.eval.cs` |

## value / varKey / file

One bind per key: `paramKey` / `paramKey.var` / `paramKey.file` (action-data-schema). NO mixing.

| prefix | meaning |
|--------|---------|
| (none) | literal; `{var}` not expanded |
| $$ | interpolation |
| $= | C# expression |

`paramKey.var` = variable key string (not expression). SkipEval fields (evalexpression `expression`): C# body with `{var}`; no `$=` prefix. To expand a declared var in value/defaultValue → `$$`/`$=` or varKey.

## Placeholders

| token | use |
|-------|-----|
| `{count}` | action variable — write `{key}` only, not `v_count` |
| `{[cliptext]}` | clipboard |
| `{quicker_in_param}` | runtime input (NOT in variables[]); tray/panel/`sys:runaction` |

## sys:evalexpression

| param | notes |
|-------|-----|
| expression | C#; `{var}=…`; multi-statement OK |
| onUiThread | UI thread when touching WPF/main UI |
| output | outputParams string key |

Condition fields may use `$=` (step_runner_get).

## Z.Expressions

`$=` and **sys:evalexpression** run as C# in Quicker's eval context. Namespaces, types, and globals below are **pre-registered** — no `using` in action JSON. Use **short type names**, not FQN (`JsonConvert`, not `Newtonsoft.Json.JsonConvert`).

### Implicit usings (template — do not paste whole block into actions)

```csharp
// Available in expression eval (illustrative — do not paste verbatim into actions)
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Public.Extensions;
using Quicker.Public.Interfaces;
using Quicker.Public.Entities;
using Quicker.Public.Searching;
// RegisterType: Regex, Path, Enumerable, JsonConvert, JArray, JObject, JProperty,
// JToken, JValue, DateTime, IDictionary<,>, IList<>, CommonExtensions,
// IActionContext, CommonOperationItem, CustomSearchResult, CustomSearchResultItem
// Auto-added on first mention: Uri; Newtonsoft.Json; collections; WinForms; Drawing; Data; Quicker.Public
IQuickerApi _qk;              // always
// IActionContext _context;   // sys:evalexpression / $=
// EvalContext _eval;         // per-action clone
```

| prefer | avoid |
|--------|-------|
| `JsonConvert.SerializeObject({obj})` | `Newtonsoft.Json.JsonConvert...` |
| `Regex.Match({text}, pat)` | `System.Text.RegularExpressions...` |
| `$={count} + 1` | `$=v_count + 1` |

| engine | notes |
|--------|-------|
| `{count}` → `v_count` | internal placeholder rewrite only |
| `{result} = {a} + {b}` | writes action variable |
| multi-statement | OK in evalexpression |
| `AutoAddMissingTypes` | types in registered assemblies resolve on first mention |

### Globals

| name | role |
|------|------|
| `_qk` | `IQuickerApi` — `.Text` (match/filter), `.Version` |
| `_context` | `IActionContext` — vars, `RunSp`, `ActionId`/`Title`, cache, `EvalExpression`, `CancellationToken` |
| `_eval` | current `EvalContext` |

`CommonExtensions` (`Quicker.Public.Extensions`): `ToJson`, `JsonToObject`, `GetValueOrDefault`, `SplitToList`, etc.

### `$$` interpolation tokens

`{var}` · `{[cliptext]}` · `{expr=}` (eval) · `{var["k"]…}` · `{ var }` with spaces → literal.

### Examples

```text
"count": { "value": "$={count} + 1" }
"{total} = {num1} + {num2}"
"JsonConvert.SerializeObject(_context.GetVariables())"
"_qk.Text.IsMatch({title}, {pattern})"
"isVerbose": { "value": "$=string.Equals({quicker_in_param}, \"verbose\", StringComparison.OrdinalIgnoreCase)" }
"msg": { "value": "$$Param: {quicker_in_param}" }
```

## See also

implementation-fallback · action-data-schema · authoring-workflow

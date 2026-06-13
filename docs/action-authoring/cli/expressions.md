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

`paramKey.var` = variable key string (not expression). `value`/`default` can be plain literals (no prefix); prefix `$=` only when the whole string is a C# expression, `$$` for interpolation. SkipEval fields (evalexpression `expression`, `*.expr` files): C# body with `{var}` — **no** `$=` prefix.

## Placeholders

| token | use |
|-------|-----|
| `{count}` | action variable — write `{key}` only, not `v_count` |
| `{[cliptext]}` | clipboard |
| `{quicker_in_param}` | runtime input (NOT in variables[]); tray/panel/`sys:runaction` |

## sys:evalexpression

| param | notes |
|-------|-----|
| expression | multi-line C# body; `{varKey}=rhs` writes action vars; `var` for locals |
| onUiThread | UI thread when touching WPF/main UI |
| output | optional — last expression value → mapped output var |

Condition fields may use `$=` (step_runner_get).

### Multi-variable assignment (`{varKey}=`)

**One `sys:evalexpression` step can update multiple action variables** — preferred over chaining several `sys:assign` steps when logic shares computation (LINQ, parsing, etc.).

| authored | runtime | effect |
|----------|---------|--------|
| `{total} = {a} + {b}` | `v_total = v_a + v_b` | writes action var `total` |
| `{a} = 1;\n{b} = 2` | two statements | writes **both** `a` and `b` |
| `var tmp = {list}.Count()` | local `tmp` | **not** persisted — use `{count} = …` to save |
| `$={count}+1` on other params | single expr | one result only — multi-assign needs **evalexpression** |

Rules:

- LHS **must** be `{declaredVarKey}` from `variables[]` — Quicker rewrites to `v_*` and syncs all touched vars after eval. Author `{key}` only, never `v_key`.
- RHS is normal C#; reference other vars as `{otherKey}`.
- `expression` is **SkipEval** — write C# directly, **no** leading `$=` (stripped if present).
- Last statement value → `output` when mapped in `outputParams`; `{varKey}=` writes happen **even without** `output` mapping.
- Separate statements with `;` and/or newlines; mix `var` locals with any number of `{varKey}=` lines.

Typical patterns:

```text
"{sum} = {num1} + {num2};\n{product} = {num1} * {num2}"
"var items = {list}.Where(x => !String.IsNullOrWhiteSpace(x)).ToList();\n{count} = items.Count;\n{result} = String.Join(\",\", items)"
```

Inline `$=` on ordinary param `value` fields: single expression returning one value (or one `{var}=` in evalexpression body). For **multiple** action-var writes in one step → `sys:evalexpression`.

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
| `{count}` → `v_count` | read placeholder rewrite only (author `{count}`, not `v_count`) |
| `{a} = …; {b} = …` | each `{varKey}=` writes that action variable |
| `var x = …` | local temp; does not update action vars |
| multi-statement + LINQ | evalexpression / `$=`; combine with `{var}=` to persist results |
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

**普通参数 `value`/`default` 写表达式时加 `$=`：**

```text
"count": { "value": "$={count} + 1" }
"isVerbose": { "value": "$=string.Equals({quicker_in_param}, \"verbose\", StringComparison.OrdinalIgnoreCase)" }
```

**`$$` 插值：**

```text
"msg": { "value": "$$Param: {quicker_in_param}" }
```

**sys:evalexpression `expression` — 不加 `$=`：**

```text
"{total} = {num1} + {num2}"
"{sum} = {num1} + {num2};\n{product} = {num1} * {num2}"
"var n = {list}.Count();\n{count} = n;\n{empty} = n == 0"
"JsonConvert.SerializeObject(_context.GetVariables())"
"_qk.Text.IsMatch({title}, {pattern})"
```

## See also

quicker-eval-expression skill · implementation-fallback · action-data-schema · authoring-workflow

# Expressions and Interpolation

用于 **`$=`**、**`$$`**、**`sys:evalexpression`**。参数键名仍来自 **`qkrpc step-runner get`**。

**优先级**：纯计算/比较/赋值优先表达式，少堆专用步骤；`step-runner search` 无结果时见 **`implementation-fallback`**。

```powershell
qkrpc guide get --topic expressions --json
```

## Prefixes in `inputParams.value`

| Prefix | Meaning | Example |
|--------|---------|---------|
| *(none)* | Literal (unless `varKey`) | `"hello"` |
| `$$` | String interpolation | `"$$Hello {userName}"` |
| `$=` | C# expression | `"$={count} + 1"` |

`varKey` values starting with `$$` / `$=` are evaluated at run time unless the param has `SkipEval`.

## Action variables

| Syntax | Use |
|--------|-----|
| `{varKey}` | Action variable (engine rewrites to `v_varKey` internally) |
| `{[cliptext]}` | Clipboard text |

**Author with `{varKey}` only** — not `v_count`, bare `count`, or `vv_cliptext`. Optional leading `$=` on the whole body is stripped before eval.

## Assignment (`sys:evalexpression`)

```text
{result} = {num1} + {num2}
{result} = {strVar}.ToUpper()
```

## `sys:evalexpression` step

| Input | Notes |
|-------|--------|
| `expression` | C# expression/script; `{var}`; optional `$=`; `{var}=value` assignment |
| `onUiThread` | UI thread (deadlock risk) |
| `output` | Return value; assignments update variables directly |

```powershell
qkrpc step-runner search --query "表达式|evalexpression" --json
qkrpc step-runner get --key sys:evalexpression --json
```

## Conditions

Many runners accept `$=` in condition fields (exact key from step schema):

```json
"someConditionKey": { "value": "$={someVar} > 0" }
```

## Implicit `using` (Z.Expressions)

Expressions behave as C# that **already has** the preamble below (`App.RegisterEval()` → `EvalManager.DefaultContext`). Use **short type names**, not FQN (`JsonConvert` not `Newtonsoft.Json.JsonConvert`).

```csharp
// Quicker/Application/App.xaml.cs — RegisterEval()

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

// Auto-add on first use: Uri; Newtonsoft.Json; collections; WinForms; Drawing; Data; Quicker.Public

IQuickerApi _qk;              // always
// IActionContext _context;   // sys:evalexpression / $=
// EvalContext _eval;         // per-action clone
```

| Prefer | Avoid |
|--------|--------|
| `JsonConvert.SerializeObject({obj})` | `Newtonsoft.Json.JsonConvert...` |
| `Regex.Match({text}, pat)` | `System.Text.RegularExpressions...` |
| `$={count} + 1` | `$=v_count + 1` |

| Engine | Detail |
|--------|--------|
| `{varKey}` → `v_varKey` | Internal rewrite only |
| `{result} = {a} + {b}` | Writes action variable |
| Statements | OK in expression step |
| `AutoAddMissingTypes` | Types from registered assemblies resolve on first mention |

### Globals

| Name | Role |
|------|------|
| `_qk` | `IQuickerApi` — `.Text` (match/filter), `.Version` |
| `_context` | `IActionContext` — vars, `RunSp`, `ActionId`/`Title`, cache, `EvalExpression`, `CancellationToken` |
| `_eval` | Current `EvalContext` |

`CommonExtensions` (`Quicker.Public.Extensions`): `ToJson`, `JsonToObject`, `GetValueOrDefault`, `SplitToList`, …

### `$$` interpolation (`{…}` tokens)

`{var}` · `{[cliptext]}` · `{expr=}` (eval) · `{var["k"]…}` · `{ var }` with spaces = literal.

### Examples

```text
"count": { "value": "$={count} + 1" }
"{total} = {num1} + {num2}"
"JsonConvert.SerializeObject(_context.GetVariables())"
"_qk.Text.IsMatch({title}, {pattern})"
```

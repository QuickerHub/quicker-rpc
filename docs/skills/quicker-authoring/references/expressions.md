# Expressions & interpolation

**When**: P4 — default to **sys:assign** for single-var steps; `$=`/`$$` inline on other params; **sys:evalexpression** for batch/multi-var or LINQ. Keys from step_runner_get.

## Pick (P4)

Single action-var write → **`sys:assign`** step (search `赋值` → get) or inline `$=`/`$$` on other params. Batch multi-`{var}=`, LINQ, or shared logic → **`sys:evalexpression`**. `sys:csscript` only for heavy `.cs` (implementation-fallback).

| case | do |
|------|-----|
| one variable, one value | **sys:assign** (`input` + `output`) |
| short text on another param | inline `paramKey` with `$=` / `$$` |
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

**One `sys:evalexpression` step can update multiple action variables** — but only when those values are **needed after this step** (downstream steps, mapped `output`, user-visible state). For **one** variable write, prefer **`sys:assign`** instead of evalexpression.

### Action vars vs `var` locals (do not over-declare)

`{varKey}=` writes the action variable store (synced after eval). **`var local = …` is the default for scratch values** — faster and avoids polluting `variables[]`.

| write | when |
|-------|------|
| `var headers = …` | parsing, loop counters, branch scratch — **only used inside this expression** |
| `{result} = …` | value read by a **later step** (`showText`, `writeClipboard`, `if`, `loop`, `*.var`, subprogram I/O) |
| `{a}=…; {b}=…` | **two or more** outputs each consumed **downstream** — not when one is just intermediate for the other |

**Do not** add entries to `variables[]` nor `{key}=` for values confined to one evalexpression step.

Anti-pattern (abusing action vars for in-step scratch):

```text
{hasAmount} = false;
{amountSum} = 0.0;
{resultText} = "";
var lines = ({csvText} ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
// hasAmount / amountSum never read outside this step — should be var locals
```

Preferred:

```text
var hasAmount = false;
var amountSum = 0.0;
var resultText = "";
var lines = ({csvText} ?? "").Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
// … compute with locals …
{resultText} = resultText   // only persist what downstream needs
```

Reuse an existing action var when the value is truly shared across steps; create a new `variables[]` entry only when a later step must read it.

| authored | runtime | effect |
|----------|---------|--------|
| `{total} = {a} + {b}` | `v_total = v_a + v_b` | writes action var `total` (downstream reads `total`) |
| `{a} = 1;\n{b} = 2` | two statements | writes **both** `a` and `b` when **both** are used later |
| `var tmp = {list}.Count()` | local `tmp` | **default** for in-step temps — no action-var sync |
| `{count} = items.Count` | `v_count = …` | persist only when `count` is read outside this step |
| `$={count}+1` on other params | single expr | one result only — multi-assign needs **evalexpression** |

Rules:

- LHS **must** be `{declaredVarKey}` from `variables[]` — Quicker rewrites to `v_*` and syncs all touched vars after eval. Author `{key}` only, never `v_key`.
- **Prefer `var` for intermediates**; each `{varKey}=` has sync cost — use only when the value crosses step boundaries.
- RHS is normal C#; reference other vars as `{otherKey}`.
- `expression` is **SkipEval** — write C# directly, **no** leading `$=` (stripped if present).
- Last statement value → `output` when mapped in `outputParams`; `{varKey}=` writes happen **even without** `output` mapping.
- Separate statements with `;` and/or newlines; mix `var` locals with `{varKey}=` only for outputs downstream needs.

Typical patterns:

```text
"{sum} = {num1} + {num2};\n{product} = {num1} * {num2}"   // both used later
"var items = {list}.Where(x => !String.IsNullOrWhiteSpace(x)).ToList();\n{result} = String.Join(\",\", items)"   // items local; result downstream
```

Inline `$=` on ordinary param `value` fields: single expression returning one value. For **one** action-var write as its own step → **`sys:assign`**. For **multiple** action-var writes in one step → `sys:evalexpression`.

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
| `{a} = …; {b} = …` | each `{varKey}=` writes that action variable (cross-step outputs only) |
| `var x = …` | **preferred** local temp; no action-var sync |
| multi-statement + LINQ | `var` for scratch; `{var}=` only for values later steps read |
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

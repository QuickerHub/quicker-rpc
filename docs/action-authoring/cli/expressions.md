# Expressions & interpolation
<!-- qkrpc-search-aliases: 表达式, 插值, interpolation, $=, evalexpression, 赋值, assign -->

**When**: P4 — default to **sys:assign** for single-var steps; `$=`/`$$` inline on other params; **sys:evalexpression** for batch/multi-var or LINQ. Keys from step_runner_get.

## Pick (P4)

| need | step / surface |
|------|----------------|
| one var | **sys:assign** |
| expr on another param | wire `$=` / `$$` on JSON string value |
| multi `{var}=`, LINQ, >4 lines | **sys:evalexpression** (+ `expression.file` → `files/*.eval.cs`) |
| heavy C# | **sys:csscript** last |

Bind: `paramKey` · `paramKey.var` · `paramKey.file` — one per key (action-data-schema).

## Two surfaces (read before writing)

| surface | syntax |
|---------|--------|
| JSON param **string value** | `$=` / `$$` at **char 0** of whole string |
| SkipEval: `expression`, `files/*.eval.cs` | raw C# — `{varKey}=…`, `var` locals — **no `$=` anywhere** |

One example (both surfaces):

```text
// data.json — wire prefix on param string
"condition": "$={count}>0"
"message": "$$共 {count} 行"

// files/sum.eval.cs — SkipEval C# only
var n = {list}.Count();
{count} = n;
{total} = {count} + 1
```

`$=` is wire-only (JSON string char 0). In SkipEval / `.eval.cs`, write plain C# only (e.g. `{count} = text.Length`).

## Expression eval template (do not paste verbatim into actions)

Pre-registered namespaces/types — no `using` in action JSON. Short type names (`JsonConvert`, not FQN).

```csharp
// --- Placeholders (read: author {key}, never v_key; runtime rewrites to v_key) ---
// {key}                 action variable from variables[]
// {[cliptext]}          clipboard text
// {quicker_in_param}    runtime input (tray / panel / runaction; not in variables[])
// $$ wire only: {var} · {[cliptext]} · {expr=} · {var["k"]…} · { var } with spaces → literal

// --- Globals ---
IQuickerApi _qk;              // .Text, .Version
// IActionContext _context;   // vars, RunSp, ActionId, EvalExpression, …
// EvalContext _eval;

// --- Implicit usings ---
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
// CommonExtensions: ToJson, JsonToObject, GetValueOrDefault, SplitToList, …
```

## See also

implementation-fallback · action-data-schema · step-modules assign / evalexpression

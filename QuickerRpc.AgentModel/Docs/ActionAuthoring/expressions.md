# Expressions and Interpolation
**链路位置**：**`overview`** P4 — 纯计算/比较/赋值优先于专用步骤。参数键名仍来自 **`step-runner get`**；无模块见 **`implementation-fallback`**（复杂逻辑 **`sys:csscript`**，勿默认长 `sys:runScript`）。
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
## `quicker_in_param`（动作运行入参）
Quicker **注入的运行时变量**，不在动作的 `variables[]` 里定义，也 **不要** 用 patch 去 `add` 它。
| 项 | 说明 |
|----|------|
| 含义 | 本次运行动作的 **输入参数字符串**（托盘/面板传参、命令行参数、`sys:runaction` 的 inputParam、手动运行填写的参数等）。无入参时为空字符串。 |
| 子程序 | 调用子程序时，父动作的入参会写入子程序上下文的 `quicker_in_param`（与 `sys:runaction` 传给目标动作一致）。 |
| `$$` | `$$...{quicker_in_param}...` |
| `$=` / `sys:evalexpression` / 赋值体 | `{quicker_in_param}` |
| 比较 | `$=string.Equals({quicker_in_param}, "keyword", StringComparison.OrdinalIgnoreCase)` 等 |
示例：
```text
$=string.Equals({quicker_in_param}, "verbose", StringComparison.OrdinalIgnoreCase)
"{mode} = {quicker_in_param}"
"$$Param: {quicker_in_param}"
```
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
`$=` 若创建窗口、访问 WPF 或 Quicker 主界面，须在 **UI 线程** 执行：用本步骤的 `onUiThread`，或子程序调用扩展表达式时将该子程序的 UI 线程参数设为 `true`（键名以 `step-runner get` 为准）。
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
`$=` and **sys:evalexpression** run as C# with Quicker's built-in eval context: namespaces, types, and globals below are **pre-registered** (no per-action setup). Use **short type names**, not FQN (`JsonConvert` not `Newtonsoft.Json.JsonConvert`).
```csharp
// Available in expression eval (illustrative — not pasted into actions)
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
"isVerbose": { "value": "$=string.Equals({quicker_in_param}, \"verbose\", StringComparison.OrdinalIgnoreCase)" }
"msg": { "value": "$$Param: {quicker_in_param}" }
```

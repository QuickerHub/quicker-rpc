---
name: expressions
description: "Quicker 参数表达式（$=、$$）与 sys:evalexpression 步骤。Use when using eval expressions instead of dedicated step modules."
allowed-tools: qkrpc_step_runner_get workspace_action_edit_data workspace_action_write_data qkrpc_action_patch
---

# 表达式与插值

**何时读**：**`overview`** P4 — 纯计算/比较/赋值优先于专用步骤。`inputParams` 键名仍须 **`qkrpc_step_runner_get`**；无合适模块见 **`implementation-fallback`**（复杂逻辑用 **`sys:csscript`**，勿默认长 `sys:runScript`）。

## `inputParams.value` 前缀

| 前缀 | 含义 | 示例 |
|------|------|------|
| （无） | 字面量（除非绑定 `varKey`） | `"hello"` |
| `$$` | 字符串插值 | `"$$Hello {userName}"` |
| `$=` | C# 表达式 | `"$={count} + 1"` |

`varKey` 的值以 `$$` / `$=` 开头时会在运行时求值（除非该参数有 `SkipEval`）。

## 动作变量写法

| 写法 | 用途 |
|------|------|
| `{varKey}` | 动作变量（引擎内部会改写为 `v_varKey`） |
| `{[cliptext]}` | 剪贴板文本 |

**写作时只用 `{varKey}`** — 不要写 `v_count`、裸 `count` 或 `vv_cliptext`。整段以 `$=` 开头时，求值前会剥掉这层前缀。

## `quicker_in_param`（动作运行入参）

Quicker **注入的运行时变量**，不在动作的 `variables[]` 里定义，也 **不要** 用 patch 去 `add` 它。

| 项 | 说明 |
|----|------|
| 含义 | 本次运行动作的 **输入参数字符串**（托盘/面板传参、命令行参数、`sys:runaction` 的 inputParam、手动运行填写等）。无入参时为空字符串。 |
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

## 赋值表达式

```text
{result} = {num1} + {num2}
{result} = {strVar}.ToUpper()
```

## `sys:evalexpression` 步骤

| 参数 | 说明 |
|------|------|
| `expression` | C# 表达式/脚本；`{var}`；可选 `$=`；`{var}=value` 形式赋值 |
| `onUiThread` | 在 UI 线程执行（有死锁风险） |
| `output` | 返回值；赋值会直接更新动作变量 |

`$=` 若创建窗口、访问 WPF 或 Quicker 主界面，须在 **UI 线程** 执行：用本步骤的 `onUiThread`，或子程序调用扩展表达式时将该子程序的 UI 线程参数设为 `true`（键名以 step-runner get 为准）。

```text
qkrpc_step_runner_search({ query: "表达式|evalexpression" })
qkrpc_step_runner_get({ key: "sys:evalexpression" })
```

## 条件字段

许多步骤在条件类字段里接受 `$=`（键名以 step schema 为准）：

```json
"someConditionKey": { "value": "$={someVar} > 0" }
```

## 隐式 `using`（Z.Expressions）

`$=` 与 **sys:evalexpression** 按 C# 在 Quicker 求值上下文中执行：下列命名空间、类型与全局对象 **已预注册**（动作里无需再配 using）。用 **短类型名**，不要 FQN（写 `JsonConvert` 而非 `Newtonsoft.Json.JsonConvert`）。

```csharp
// 表达式求值中可用（示意 — 不要整段贴进动作）
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
// 首次提及自动加入: Uri; Newtonsoft.Json; collections; WinForms; Drawing; Data; Quicker.Public
IQuickerApi _qk;              // always
// IActionContext _context;   // sys:evalexpression / $=
// EvalContext _eval;         // per-action clone
```

| 推荐 | 避免 |
|------|------|
| `JsonConvert.SerializeObject({obj})` | `Newtonsoft.Json.JsonConvert...` |
| `Regex.Match({text}, pat)` | `System.Text.RegularExpressions...` |
| `$={count} + 1` | `$=v_count + 1` |

| 引擎行为 | 说明 |
|----------|------|
| `{varKey}` → `v_varKey` | 仅内部改写 |
| `{result} = {a} + {b}` | 写入动作变量 |
| 多语句 | 表达式步骤中允许 |
| `AutoAddMissingTypes` | 已注册程序集中的类型首次提及即可解析 |

### 全局对象

| 名称 | 作用 |
|------|------|
| `_qk` | `IQuickerApi` — `.Text`（匹配/筛选）、`.Version` |
| `_context` | `IActionContext` — 变量、`RunSp`、`ActionId`/`Title`、缓存、`EvalExpression`、`CancellationToken` |
| `_eval` | 当前 `EvalContext` |

`CommonExtensions`（`Quicker.Public.Extensions`）：`ToJson`、`JsonToObject`、`GetValueOrDefault`、`SplitToList` 等。

### `$$` 插值中的 `{…}` 记号

`{var}` · `{[cliptext]}` · `{expr=}`（求值）· `{var["k"]…}` · 带空格的 `{ var }` 按字面量处理。

### 示例

```text
"count": { "value": "$={count} + 1" }
"{total} = {num1} + {num2}"
"JsonConvert.SerializeObject(_context.GetVariables())"
"_qk.Text.IsMatch({title}, {pattern})"
"isVerbose": { "value": "$=string.Equals({quicker_in_param}, \"verbose\", StringComparison.OrdinalIgnoreCase)" }
"msg": { "value": "$$Param: {quicker_in_param}" }
```

## 相关

`implementation-fallback` · `authoring-workflow` · `overview`


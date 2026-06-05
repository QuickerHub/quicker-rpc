# 表达式与插值

**何时读**：**`overview`** P4 — **默认首选**。凡 C# 能写的数据变换（Split、LINQ、JSON、多变量赋值）优先 **`$=` / `sys:evalexpression`**，再考虑专用步骤；仅当表达式 **不够** 时才 **`sys:csscript`**（见 **`implementation-fallback`**）。`inputParams` 键名仍须 **`step-runner get`**。

## 优先于 `sys:csscript`

下列需求 **不要** 写 `sys:csscript` + `Exec(Quicker.Public.IStepContext context)` 样板 — 用 **`sys:evalexpression`** 一步完成（支持多语句、LINQ、隐式 `using`，见下文 Z.Expressions）：

| 典型需求 | 推荐 |
|----------|------|
| 字符串 Split / Trim / Join | `sys:evalexpression` |
| LINQ（Where / Distinct / OrderBy / Select） | `sys:evalexpression` |
| 一次更新多个动作变量 | `sys:evalexpression` 内 `{var}=…` |
| JSON 序列化/反序列化 | `$=` 或 `sys:evalexpression`（`JsonConvert` 已注册） |
| 需独立 `.cs` 文件、复杂类、长时间维护的库代码 | `sys:csscript` |

**反例（低效）** — 剪贴板文本去空行、去重、排序后写回变量，却用 csscript：

```json
"script": {
  "value": "//.cs\nusing System;\nusing System.Linq;\n...\npublic static void Exec(...)\n{ ... }"
}
```

**反例（难维护）** — 长脚本/长字符串写在 `value` 里（超过 4 行）：应 **`files/` + `"file": "files/…"`**（**`action-steps`**）。`sys:evalexpression` 的短多行 `expression` 可内联；更长且支持 `file` 时外置为 **`files/*.eval.cs`**（便于编辑器 C# 高亮），勿用 `.cs` 与 C# 脚本混名。

**正例（推荐）** — 同逻辑用 **`sys:evalexpression`**（键名以 step-runner get 为准）：

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": {
      "value": "var lines = {clipText}.Split(new[] { \"\\r\\n\", \"\\n\", \"\\r\" }, StringSplitOptions.None);\nvar beforeCount = lines.Length;\nvar result = lines\n  .Select(l => l.TrimEnd('\\r', '\\n'))\n  .Where(l => !string.IsNullOrWhiteSpace(l))\n  .Distinct(StringComparer.OrdinalIgnoreCase)\n  .OrderBy(l => l, StringComparer.OrdinalIgnoreCase)\n  .ToList();\n{beforeCount} = beforeCount;\n{afterCount} = result.Count;\n{processedText} = string.Join(Environment.NewLine, result);"
    }
  }
}
```

前置：用剪贴板/变量模块把文本写入 `{clipText}`；在 **C# 表达式/赋值体**里用 `{count}` 这类占位引用变量，勿写 `context.GetVarValue`。

> **术语**：下文 **`inputParams.*.varKey`** 是 JSON 字段（绑定变量 key）；**`{count}`**、**`{clipText}`** 是写在 `value` / 表达式**字符串内**的占位符。二者不要混用。

## `inputParams`：`value` 与 `varKey`

每个参数键对应一个对象；**三选一**：`{ "value": "…" }`、`{ "varKey": "…" }`、`{ "file": "…" }`（见 **`action-steps`**）。

### `value` 字符串前缀

| 前缀 | 含义 | 示例 |
|------|------|------|
| （无） | 纯字面量（**不含**需展开的 `{变量}`） | `"hello"` |
| `$$` | 字符串插值 | `"$$Hello {userName}"` |
| `$=` | C# 表达式 | `"$={count} + 1"` |

**求值**：前缀写在 **`value` 字符串**上。以 `$$` / `$=` 开头时 Quicker 在运行时插值或求值。

**`SkipEval` 参数**（如 `sys:evalexpression` 的 `expression`）：`value` **不必**整段以 `$=` 开头；内容为 C# 表达式/脚本，由**该步骤**在运行时求值（`{var}` 占位仍按表达式规则解析）。`variables[].defaultValue` 若需插值/求值，前缀规则与 `value` 相同（见 **`action-variables`**）。

### `varKey`（绑定变量）

`{ "varKey": "userName" }` 表示本参数**直接读取**动作变量 `userName` 的当前值；字段内容是变量的 **key**（与 `variables[].key` 一致），**不是**表达式文本，也**不会**因 key 或变量内容含 `$$`/`$=` 而触发 `value` 那套前缀求值。

**常见笔误**：无 `$$`/`$=` 前缀的 **`value` / `defaultValue` 内联字符串**里写了已定义变量名的 `{name}`（如 `{lineCount}`）时，运行时**不会**按插值展开，应改为 `$$…{name}…` 或 `$=…`，或改用 `varKey` 绑定。未在 `variables[]` 中声明的 `{…}` 按字面量处理。`sys:evalexpression` 的 `expression` 等 **SkipEval** 字段不适用「整段必须以 `$$`/`$=` 开头」规则。

## 表达式与插值文本中的 `{…}` 占位符

（本节指 **字符串内容**里的记号，不是 `inputParams` 的 `varKey` 字段。）

| 写法 | 用途 |
|------|------|
| `{count}` 等 | 动作变量（引擎内部会改写为 `v_count`） |
| `{[cliptext]}` | 剪贴板文本 |

**写作时只用 `{变量key}`** — 不要写 `v_count`、裸 `count` 或 `vv_cliptext`。在 **`$=` / `$$` 的 `value` 字符串**上，整段以 `$=` 开头时求值前会剥掉该前缀；`sys:evalexpression` 的 `expression` 等 SkipEval 字段通常直接写 C# 体，无需整段 `$=`。

## `quicker_in_param`（动作运行入参）

Quicker **注入的运行时变量**，不在动作的 `variables[]` 里定义，也 **不要** 写入 `data.json` 的 `variables[]`。

| 项 | 说明 |
|----|------|
| 含义 | 本次运行动作的 **输入参数字符串**（托盘/面板传参、命令行参数、`sys:runaction` 的 inputParam、**动作右键菜单项数据**、手动运行填写等）。无入参时为空字符串。 |
| 子程序 | 调用子程序时，父动作的入参会写入子程序上下文的 `quicker_in_param`（与 `sys:runaction` 传给目标动作一致）。 |
| `$$` | `$$...{quicker_in_param}...` |
| `$=` / `sys:evalexpression` / 赋值体 | `{quicker_in_param}` |
| 比较 | `$=string.Equals({quicker_in_param}, "keyword", StringComparison.OrdinalIgnoreCase)` 等 |

示例：

```text
$=string.Equals({quicker_in_param}, "verbose", StringComparison.OrdinalIgnoreCase)
{mode} = {quicker_in_param}                    // sys:evalexpression 赋值体（非 inputParams.value）
"$$Param: {quicker_in_param}"                  // inputParams.value 插值示例
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
| `output` | 返回值写入的动作变量；`outputParams` 绑定见 **`action-steps`**（如 `"output": "clipText"` 或 `"config.title"` 写入词典键） |

`$=` 若创建窗口、访问 WPF 或 Quicker 主界面，须在 **UI 线程** 执行：用本步骤的 `onUiThread`，或子程序调用扩展表达式时将该子程序的 UI 线程参数设为 `true`（键名以 step-runner schema 为准）。

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
| `{count}` → `v_count` | 表达式内占位，仅内部改写 |
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

`implementation-fallback` · `common-operation-item` · `authoring-workflow` · `overview`

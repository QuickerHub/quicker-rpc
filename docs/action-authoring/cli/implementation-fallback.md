# 实现选型与回退

**何时读**：**`overview`** P4 — `step-runner search` 无合适模块，或需求是计算/逻辑而非固定 UI。

## 优先级

| 级 | 手段 | 适用 |
|----|------|------|
| 1 | `$=` / `$$`（**expressions**） | 参数内运算、拼接、比较、条件字段 |
| 2 | **`sys:evalexpression`** | 多行 C#、LINQ、字符串处理、**一次写多个变量** |
| 3 | 专用模块（**step-runner search** → get） | 剪贴板、HTTP、文件、UI 等 |
| 4 | **`sys:csscript`** | 表达式 **仍无法表达** 时（需 `Exec`、复杂类型、外部 API 编排） |
| 5 | `sys:runScript` | 极短 PS/CMD 或用户已有脚本 |
| 6 | `sys:run` | 外部 exe |

**禁止**：能用 **`sys:evalexpression`** 解决的逻辑（Split/LINQ/赋值/JSON 等）却写 **`sys:csscript`** 整段 `Exec` 样板。无专用模块时也 **先表达式、后 csscript**，勿默认长 PowerShell。

**`sys:csscript`**（及其它长脚本参数）：脚本放 **`files/*.cs`**，`inputParams` 用 **`{ "file": "files/…" }`**，勿在 `data.json` 里塞超长 `"value"`（**`action-steps`**）。

## 决策

```text
字符串/LINQ/多变量赋值/JSON 变换？ → expressions（$= 或 sys:evalexpression）
仅计算/比较/单参数赋值？           → $= / $$ 或 evalexpression
已知 stepRunnerKey？              → step-runner get → 写入 data.json → 保存
否则                               → step-runner search（一次 OR|*）→ get
仍无合适模块且表达式不够？         → sys:csscript
```

步骤与参数写入 **`data.json`** / **`files/`** 的形状见 **`action-steps`**、**`action-project-files`**。

## 易混淆项

| 场景 | 选用 | 说明 |
|------|------|------|
| 赋值/计算/比较/LINQ/字符串变换 | **`expressions`** / **`sys:evalexpression`** | 勿用 `sys:csscript` 写简单 `Exec`；勿用已下架 `sys:assign` |
| 复杂 C#（需独立 .cs、长生命周期逻辑） | `sys:csscript` | 表达式模块无法表达时再用 |
| 向**前台活动窗口**输入文字 | `sys:outputText`（发送文本到窗口） | 非 `sys:showText`（独立文本窗口） |
| 需要 else 分支 | `sys:if` | `sys:simpleIf` 无 else 结构 |
| 多文件操作 | `sys:fileOperation` | 用 `type` 选子操作 |
| 多子操作模块 | 先 search/get 定 key + control | 如 `stringProcess`、`uiautomation` |

## 相关

`expressions` · `step-runner-search` · `authoring-workflow` · `overview`

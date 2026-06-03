# 实现选型与回退

**何时读**：**`overview`** P4 — `step-modules` / search 无合适模块，或需求是计算/逻辑而非固定 UI。

## 优先级

| 级 | 手段 | 适用 |
|----|------|------|
| 1 | `$=` / `$$`（**expressions**） | 参数内运算、拼接、比较、条件字段 |
| 2 | **`sys:evalexpression`** | 多行 C#、LINQ、字符串处理、**一次写多个变量** |
| 3 | 专用模块（**step-modules** → step-runner get） | 剪贴板、HTTP、文件、UI 等 |
| 4 | **`sys:csscript`** | 表达式 **仍无法表达** 时（需 `Exec`、复杂类型、外部 API 编排） |
| 5 | `sys:runScript` | 极短 PS/CMD 或用户已有脚本 |
| 6 | `sys:run` | 外部 exe |

**禁止**：能用 **`sys:evalexpression`** 解决的逻辑（Split/LINQ/赋值/JSON 等）却写 **`sys:csscript`** 整段 `Exec` 样板。无专用模块时也 **先表达式、后 csscript**，勿默认长 PowerShell。

**`sys:csscript`**（及其它长脚本参数）：脚本放 **`files/*.cs`**，`inputParams` 用 **`{ "file": "files/…" }`**，勿在 `data.json` 里塞超长 `"value"`（**`action-steps`**）。

## 决策

```text
字符串/LINQ/多变量赋值/JSON 变换？ → expressions（$= 或 sys:evalexpression）
仅计算/比较/单参数赋值？           → $= / $$ 或 evalexpression
step-modules 有 key？              → step-runner get → 写入 data.json → 保存
否则                               → step-runner search（一次 OR|*）→ get
仍无合适模块且表达式不够？         → sys:csscript
```

{{#only-agent}}
写入步骤/参数：**`workspace_action_edit_data`** 或 **`write_data`**，再 **`qkrpc_action_patch({ id })`**（见 **`workspace-editing`**）。
{{/only-agent}}

## 相关

`expressions` · `step-runner-search` · `step-modules` · `authoring-workflow` · `overview`

---
name: implementation-fallback
description: "无专用模块时的实现选型：表达式 vs sys:csscript vs sys:runScript。Use when no step module fits or choosing between expression and script steps."
allowed-tools: qkrpc_step_runner_search qkrpc_step_runner_get qkrpc_action_patch
metadata:
  phase: "P4"
---

# 实现选型与回退

**何时读**：**`overview`** P4 — `step-modules` / search 无合适模块，或需求是计算/逻辑而非固定 UI。

## 优先级

| 级 | 手段 | 适用 |
|----|------|------|
| 1 | `$=` / `$$`（**expressions**） | 单步内运算、拼接、比较 |
| 2 | `sys:evalexpression` | 多行赋值、分支前准备 |
| 3 | 专用模块（**step-modules** → step-runner get） | 剪贴板、HTTP、文件等 |
| 4 | **`sys:csscript`** | 无模块时 **默认**（C#） |
| 5 | `sys:runScript` | 极短 PS/CMD 或用户已有脚本 |
| 6 | `sys:run` | 外部 exe |

无专用模块时优先 **`sys:csscript`**，勿默认长 PowerShell。

## 决策

```text
仅计算/比较/赋值？ → expressions / evalexpression
step-modules 有 key？ → step-runner get → 写入 data.json → 保存
否则 → step-runner search（一次 OR|*）→ get → 仍无则 csscript
```

写入步骤/参数：**`workspace_action_edit_data`** 或 **`write_data`**，再 **`qkrpc_action_patch({ id })`**（见 **`workspace-editing`**）。

## 相关

`expressions` · `step-runner-search` · `step-modules` · `authoring-workflow` · `overview`


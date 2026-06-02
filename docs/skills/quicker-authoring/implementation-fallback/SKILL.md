---
name: implementation-fallback
description: "无专用模块时的实现选型：表达式 vs sys:csscript vs sys:runScript。Use when no step module fits or choosing between expression and script steps."
allowed-tools: qkrpc_step_runner_search qkrpc_step_runner_get qkrpc_action_patch
metadata:
  phase: "P4"
---

# 实现方式与回退
**何时读**：`step-modules`/search 无合适模块，或需求是计算/逻辑而非固定 UI。
## 优先级
| 级 | 手段 | 适用 |
|----|------|------|
| 1 | 参数 `$=` / `$$`（**`expressions`**） | 单步内运算、拼接 |
| 2 | `sys:evalexpression` | 多行赋值、分支前准备 |
| 3 | 专用模块（**`step-modules`** → **`step-runner get`**） | 剪贴板、HTTP、文件等 |
| 4 | **`sys:csscript`（C#）** | 无模块时**默认** |
| 5 | `sys:runScript` | 仅极短 PS/CMD 或用户脚本 |
| 6 | `sys:run` | 外部 exe/CLI |
无专用模块时建议 **`sys:csscript`**（C#），少用长 PowerShell（见下文表）。
## 回退链
```text
需求 → 仅计算？→ expressions / evalexpression
     → step-modules 有 key？→ step-runner get → patch
     → step-runner search（单次 OR|*）→ get → patch
     → 仍无 → sys:csscript → 仅一行系统命令才 runScript
```
## 相关
`authoring-workflow`（P4）· `expressions` · `step-runner-search` · `overview`


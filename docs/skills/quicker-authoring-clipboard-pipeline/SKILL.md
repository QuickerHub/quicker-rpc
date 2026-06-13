---
name: quicker-authoring-clipboard-pipeline
description: "Quicker 剪贴板流水线：getClipboardText → 变换 → writeClipboard。写剪贴板读写、复制结果到剪贴板、剪贴板文本处理类动作时加载。"
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 剪贴板流水线（quicker-authoring-clipboard-pipeline）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`docs/authoring-references/action-patterns/clipboard-pipeline.md`

## 何时加载

数据经系统剪贴板进出：读剪贴板 → 处理 → 写回，或 HTTP/表达式结果写入剪贴板。不是选区流水线、不是单步模块配置。

## 步骤骨架

1. `sys:getClipboardText`（`format: UnicodeText`）
2. `sys:stringProcess` / `regexExtract` / `evalexpression` / `http`+提取
3. `sys:writeClipboard`（`type: text` + `text.var`，或 `type: auto` + `input.var`）
4. 可选 `notify` / `showText`

## 硬规则（本场景）

- 读写前 `step_runner_get`（`getClipboardText`、`writeClipboard`）；注意 `writeClipboard` 的 `controlField`（`text` vs `input`）。
- 会覆盖用户剪贴板；需要保留时先备份再恢复。
- 找 exemplar：`qkrpc action library search` → `action shared get`（只读，禁止 patch）。

## 变量约定

| 角色 | key |
|------|-----|
| 剪贴板文本 | `text` / `clipText` |
| 结果 | `result` |
| 成功 | `clipOk` (bool) |

## 陷阱

- 慢应用读取加大 `waitMs`；`^c` 后读取需 `delay`。
- 复杂剪贴板管理器动作用 structure 学习即可，勿照搬子程序+cscript 链。

## 深度阅读

- `action-patterns/clipboard-pipeline.md`
- authored: getClipboardText · writeClipboard · stringProcess



# 选中文本流水线（quicker-authoring-selection-pipeline）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`docs/authoring-references/action-patterns/selection-pipeline.md`

## 何时加载

任务链为「读取当前选区 → 处理文本 → 写回窗口或展示」。不是单步模块配置、不是纯 HTTP/文件批处理。

## 步骤骨架

1. `sys:getSelectedText`（首选，`trim`）或 `sendKeys ^c` + `getClipboardText`（兼容）
2. `sys:stringProcess` / `translation` / `evalexpression`（按 P4 选型）
3. `sys:outputText`（`paste` 默认）或 `MsgBox` 仅展示

## 硬规则（本场景）

- 读选区前 `step_runner_get`；写回前 `step_runner_get`（`outputText`、`getSelectedText`）。
- 变量：`selectedText`/`text` 入 → 变换后覆写 `text` 或新 `result`。
- 无头测试：`getSelectedText` + `useActionParam: true`，`action run --param "样本"`。
- 需保留用户剪贴板：备份 `getClipboardText` 或在读前评估 `tryNoClipboard`。

## 变量约定

| 角色 | key |
|------|-----|
| 选区原文 | `text` |
| 成功 | `gotText` (bool) |

## 陷阱

- 默认读写都经剪贴板；PDF/慢应用加大 `waitMs`。
- `outputText` 在 Excel 编辑态可能只改单格 — 先 `keyInput` Esc。

## 深度阅读

- `action-patterns/selection-pipeline.md`
- authored: getSelectedText · outputText · stringProcess

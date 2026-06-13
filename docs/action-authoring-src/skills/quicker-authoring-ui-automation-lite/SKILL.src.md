
# 前台窗口与按键（quicker-authoring-ui-automation-lite）

> **父 skill**：quicker-authoring · **状态**：promoted · **参考**：`action-patterns/ui-automation-lite.md`

## 何时加载

切换前台窗口并向目标程序发送按键/文本。不是选区 pipeline。

## 步骤骨架

1. `activateProcessMainWindow`（`process` + `path`）
2. `delay` 200–500ms
3. `keyInput` 或 `sendKeys`
4. 可选 `restoreActiveWindow`

## 硬规则

- **`path` 必填**；`process` 为无后缀 exe 名。
- **勿激活 Quicker 自身**。
- Electron/IDE 上 `keyInput` 可能失败 → 试 `sendKeys` 或原生 Win32 目标。

## 深度阅读

- `action-patterns/ui-automation-lite.md` · delay-retry

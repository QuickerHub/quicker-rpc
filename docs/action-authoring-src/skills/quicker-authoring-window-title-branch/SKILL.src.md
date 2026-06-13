
# 窗口标题分支（quicker-authoring-window-title-branch）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/window-title-branch.md`

## 何时加载

读前台窗口标题，按关键字分支（最大化/提示等）。对标 `window-vscode-branch` benchmark。

## 步骤骨架

1. `getWindowTitle` `foreground` → `title` + `handle`
2. `sys:if` 标题 Contains/IndexOf
3. True：`windowOperations` `show` + `showCmd: 3`；False：提示

## 硬规则

- 双分支用 **`sys:if`** + `elseSteps`。
- 最大化：`windowOperations` `type: show`，`showCmd: 3`（非 maximize 枚举）。
- mock：`window-vscode-branch` profile。

## 深度阅读

- `action-patterns/window-title-branch.md` · ui-automation-lite

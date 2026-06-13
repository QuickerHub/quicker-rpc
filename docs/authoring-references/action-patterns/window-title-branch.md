# 窗口标题分支

> **场景**：读前台标题 → 含关键字则窗口操作，否则提示 · **难度**：M · **exemplar**：`__pattern_learning__window_branch` trace ✅

## 何时用

按前台窗口标题（IDE、浏览器等）走不同自动化路径。与 **ui-automation-lite** 的区别：本模式以 **getWindowTitle + if** 为入口，非 activate+按键；benchmark `window-vscode-branch`。

## 步骤骨架

1. **getWindowTitle** — `which: foreground` → `title`、`handle`
2. **sys:if** — `$=({title} ?? "").IndexOf("关键字", StringComparison.OrdinalIgnoreCase) >= 0`
3. **True** — `windowOperations` `type: show`，`showCmd: 3`（最大化），`hWnd.var` 或留空=前台
4. **False** — `MsgBox` / `showText` 提示
5. **状态变量** — `isVscode` 等供 mock 断言

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 窗口标题 | `title` | Text |
| 句柄 | `hWnd` | Number |
| 分支标记 | `isVscode` | Boolean |
| 提示 | `message` | Text |

## 示例（trace ✅）

前台非 VS Code → `NOT_VSCODE`；mock profile `window-vscode-branch` 期望 `isVscode=True`。

Patch：`.local/patch-window-title-branch.json`

### 最大化（windowOperations）

```json
{
  "stepRunnerKey": "sys:windowOperations",
  "inputParams": {
    "type": "show",
    "hWnd.var": "hWnd",
    "showCmd": "3",
    "stopIfFail": "False"
  }
}
```

> `showCmd: 3` = SW_MAXIMIZE；无独立 `maximize` controlField。

## 陷阱

- 需要 **else** 分支时用 **`sys:if`**，不用 `simpleIf`。
- `getWindowTitle` 的 `which: foreground`；`handle` → `hWnd.var`。
- trace 依赖真实前台窗口；mock 用 `--mock-profile window-vscode-branch`。
- ActionRuntime：`sys:if` 的 `$=` 条件须走表达式求值（`ReadConditionBoolean`）；勿把 `$={var}` 当成单变量名查找。
- 勿激活 Quicker 自身窗口做 UI 测试。

## 相关

ui-automation-lite · getWindowTitle · windowOperations · skill：`quicker-authoring-window-title-branch`

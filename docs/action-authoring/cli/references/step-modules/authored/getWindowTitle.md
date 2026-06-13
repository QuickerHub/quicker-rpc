# sys:getWindowTitle

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[getwindowtitle](https://getquicker.net/KC/Help/Doc/getwindowtitle)

**用途**：获取或查找窗口标题、句柄、进程与矩形信息（多 `which` 模式）。

## 示例

### 前台窗口标题

```json
{
  "stepRunnerKey": "sys:getWindowTitle",
  "inputParams": {
    "which": "foreground"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "窗口标题",
    "handle": "句柄",
    "procName": "进程名"
  }
}
```

### 按类名查找窗口

```json
{
  "stepRunnerKey": "sys:getWindowTitle",
  "inputParams": {
    "which": "findWindow",
    "className": "Notepad",
    "windowName": "无标题",
    "onlyVisible": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "handle": "句柄",
    "path": "进程路径"
  }
}
```

## 陷阱

- `which` 决定模式：`foreground` / `findWindow` / `fromHwnd`+`hWnd` / `top_windows`（输出 `topLevelWindows` 词典）/ `child_windows` 等；写步骤前 `get --control-field <which>` 过滤参数。
- `findWindow` 可组合 `className`、`windowName`、`procIdOrName`；`useRegex: true` 时类名/标题支持正则。
- 位置输出：`rect` 为 `Left,Top,Right,Bottom,Width,Height` 文本；`rectDict` 为词典；后续操作用 `handle` 传给 `windowOperations` / `sendMessage`。

## 相关

windowOperations · activateProcessMainWindow · uiautomation · getActiveProcessInfo · step-runner-get

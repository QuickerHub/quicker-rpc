# 前台窗口与按键

> **场景**：激活目标程序窗口 → 短暂等待 → 模拟按键/输入 · **难度**：M · **exemplar**：`__pattern_learning__ui_lite` trace ✅（激活链）

## 何时用

向指定应用发送快捷键或文本：先 `activateProcessMainWindow` 把窗口置前，再 `delay` 等待焦点稳定，再 `keyInput` / `sendKeys`。与 **selection-pipeline** 的区别：不依赖当前选区，显式切换前台窗口。

## 步骤骨架

1. **activateProcessMainWindow** — `process`（exe 名无后缀）+ **`path`**（进程不存在时启动）
2. **delay** — 200–500ms 等窗口就绪
3. **keyInput** — `{Ctrl}c` 等；或 **sendKeys** 动态序列
4. **可选** — `restoreActiveWindow` 恢复原焦点
5. **收尾** — 读 `isSuccess` / `mainWinTitle` 验证

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 激活成功 | `activated` | Boolean |
| 窗口标题 | `winTitle` | Text |
| 结果 | `result` | Text |

## 示例（trace ✅）

无头验证：`activateProcessMainWindow`（`Cursor` + 完整 `path`）→ `delay` 200ms → `evalexpression` → `showText` **`UI_OK`**。  
含 `keyInput` 的完整链见 `.local/patch-ui-automation-lite.json`（本机 trace 在 Electron 目标上 `keyInput` 可能触发解析错误，见陷阱）。

Patch（trace 通过）：`.local/patch-ui-automation-lite-no-key.json`

### 最小 patch（激活 + 等待）

```json
{
  "stepRunnerKey": "sys:activateProcessMainWindow",
  "inputParams": {
    "process": "Cursor",
    "path": "C:\\Users\\ldy\\AppData\\Local\\Programs\\cursor\\Cursor.exe",
    "stopIfFail": "False"
  },
  "outputParams": {
    "isSuccess": "activated",
    "mainWinTitle": "winTitle"
  }
},
{
  "stepRunnerKey": "sys:delay",
  "inputParams": { "delayMs": "200" }
}
```

## 陷阱

- **`path` 必填**（schema required），即使进程已存在；用于不存在时自动启动。
- **不能激活 Quicker 自身**（`不支持激活Quicker进程主窗口`）。
- Win11 **商店版记事本** 与 `notepad.exe` 进程名不一致，激活常失败；经典 `System32\notepad.exe` 或换已运行进程。
- **`keyInput` 对 Electron/IDE** 可能报 `Invalid JavaScript property identifier` 并中止；可改 `sendKeys`、增大 `holdMs`，或只对 Win32 原生窗口使用。
- `process` 写 exe 名去掉 `.exe`（`notepad` 非完整路径）。
- 托盘程序可配 `hotkey`；无句柄时用 `windowTitle` / `className` 正则。

## 相关

activateProcessMainWindow · keyInput · sendKeys · delay · restoreActiveWindow · imeControl

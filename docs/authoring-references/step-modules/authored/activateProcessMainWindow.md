# sys:activateProcessMainWindow

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[activateprocessmainwindow](https://getquicker.net/KC/Help/Doc/activateprocessmainwindow)

**用途**：找到指定进程主窗口并激活到前台；进程未运行时按 `path` 启动后再激活。

## 示例

### 按进程名激活记事本

```json
{
  "stepRunnerKey": "sys:activateProcessMainWindow",
  "inputParams": {
    "process": "notepad",
    "path": "C:\\Windows\\System32\\notepad.exe"
  },
  "outputParams": {
    "isSuccess": "成功",
    "mainWinHandle": "句柄",
    "mainWinTitle": "标题"
  }
}
```

### 托盘程序用热键唤醒

```json
{
  "stepRunnerKey": "sys:activateProcessMainWindow",
  "inputParams": {
    "process": "QQ",
    "path": "C:\\Program Files\\Tencent\\QQ\\QQ.exe",
    "hotkey": "Ctrl+Alt+Q"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 无句柄时用类名/标题匹配

```json
{
  "stepRunnerKey": "sys:activateProcessMainWindow",
  "inputParams": {
    "process": "myapp",
    "path": "D:\\Apps\\myapp.exe",
    "className": "MyMainWindow",
    "windowTitle": ".*主界面.*"
  },
  "outputParams": {
    "isSuccess": "成功",
    "pid": "PID"
  }
}
```

## 陷阱

- `process` 为 exe 名去掉 `.exe`（如 `notepad`），不是完整路径；schema 要求 `path` 始终填写以便进程不存在时自动启动。
- `className` / `windowTitle` 支持正则；仅在未能拿到主窗口句柄时参与匹配，仍失败则取该进程在桌面可见的第一个窗口。
- `hotkey` 格式同 `sys:sendKeys`；仅在窗口隐藏到托盘且软件自身支持全局热键时作为兜底（见 KC 模拟按键 B 文档）。

## 相关

sendKeys · getWindowTitle · checkProcessExists · restoreActiveWindow · step-runner-get

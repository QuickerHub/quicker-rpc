# sys:activateProcessMainWindow

> **来源**：step JSON 示例 · **官方**：[activateprocessmainwindow](https://getquicker.net/KC/Help/Doc/activateprocessmainwindow)

**用途**：找到指定进程主窗口并激活到前台（未运行时可按路径启动）。

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

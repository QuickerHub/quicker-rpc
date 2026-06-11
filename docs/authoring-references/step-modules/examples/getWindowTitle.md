# sys:getWindowTitle

> **来源**：step JSON 示例 · **官方**：[getwindowtitle](https://getquicker.net/KC/Help/Doc/getwindowtitle)

**用途**：获取前台/指定窗口标题与句柄等信息。

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

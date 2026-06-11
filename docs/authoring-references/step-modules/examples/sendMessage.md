# sys:sendMessage

> **来源**：step JSON 示例 · **官方**：[sendmessage](https://getquicker.net/KC/Help/Doc/sendmessage)

**用途**：向指定窗口句柄发送 Win32 消息。

## 示例

### SendMessage 数值参数

```json
{
  "stepRunnerKey": "sys:sendMessage",
  "inputParams": {
    "operation": "SendMessage",
    "hWnd.var": "窗口句柄",
    "wMsg": "0x0112",
    "wParam": "0xF170",
    "lParam": "0"
  },
  "outputParams": {
    "isSuccess": "成功",
    "rtn": "返回值"
  }
}
```

### PostMessage 异步

```json
{
  "stepRunnerKey": "sys:sendMessage",
  "inputParams": {
    "operation": "PostMessage",
    "hWnd.var": "窗口句柄",
    "wMsg": "0x0010",
    "wParam": "0",
    "lParam": "0"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 文本 lParam

```json
{
  "stepRunnerKey": "sys:sendMessage",
  "inputParams": {
    "operation": "SendMessageTextLParam",
    "hWnd.var": "窗口句柄",
    "wMsg.var": "消息码",
    "textLParam.var": "文本参数"
  },
  "outputParams": {
    "rtn": "返回值"
  }
}
```

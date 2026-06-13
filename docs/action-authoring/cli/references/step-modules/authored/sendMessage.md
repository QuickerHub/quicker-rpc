# sys:sendMessage

> **分类**：窗口 · **来源**：仓库手写 · **官方**：[sendmessage](https://getquicker.net/KC/Help/Doc/sendmessage)

**用途**：向窗口句柄发送 Win32 SendMessage/PostMessage。

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

## 陷阱

- `hWnd` 留空或 0=前台窗口；`SendMessageTextLParam` 时文本走 `textLParam` 非 `lParam`。
- `wMsg`/`wParam`/`lParam` 多为十六进制字符串；查 Win32 API 文档理解 `rtn`。
- 写步骤前 `get --control-field SendMessage` 等。

## 相关

windowOperations · activateProcessMainWindow · step-runner-get

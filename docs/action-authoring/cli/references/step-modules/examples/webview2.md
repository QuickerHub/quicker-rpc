# sys:webview2

> **来源**：step JSON 示例 · **官方**：[webview2](https://getquicker.net/KC/Help/Doc/webview2)

**用途**：用 WebView2 打开网页、执行脚本或等待页面事件。

## 示例

### 打开 URL

```json
{
  "stepRunnerKey": "sys:webview2",
  "inputParams": {
    "type": "OpenUrl",
    "url.var": "地址",
    "title": "预览"
  },
  "outputParams": {
    "isSuccess": "成功",
    "hWnd": "窗口句柄",
    "webView": "WebView标识"
  }
}
```

### 打开并等待加载

```json
{
  "stepRunnerKey": "sys:webview2",
  "inputParams": {
    "type": "OpenAndWaitLoad",
    "url": "https://example.com",
    "autoCloseKey.var": "窗口标识"
  },
  "outputParams": {
    "isNavCompleted": "导航完成",
    "docTitle": "标题",
    "currUri": "当前地址"
  }
}
```

### 执行脚本

```json
{
  "stepRunnerKey": "sys:webview2",
  "inputParams": {
    "type": "ExecuteScript",
    "webView.var": "WebView标识",
    "script": "document.title"
  },
  "outputParams": {
    "scriptResult": "脚本结果"
  }
}
```

### 向页面发消息

```json
{
  "stepRunnerKey": "sys:webview2",
  "inputParams": {
    "type": "SendMessage",
    "webView.var": "WebView标识",
    "sendMessage.var": "消息体"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

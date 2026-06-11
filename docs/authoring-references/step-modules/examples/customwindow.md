# sys:customwindow

> **来源**：step JSON 示例 · **官方**：[customwindow](https://getquicker.net/KC/Help/Doc/customwindow)

**用途**：XAML 自定义 WPF 窗口。

## 示例

### 显示并等待关闭

```json
{
  "stepRunnerKey": "sys:customwindow",
  "inputParams": {
    "type": "ShowAndWaitClose",
    "windowMarkup": "<Window xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\" xmlns:qk=\"https://getquicker.net\" Title=\"Demo\" Width=\"400\" Height=\"200\"><Button qk:Att.Action=\"close:ok\" Content=\"OK\"/></Window>",
    "windowId": "demo-win"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "关闭结果"
  }
}
```

### 非阻塞显示

```json
{
  "stepRunnerKey": "sys:customwindow",
  "inputParams": {
    "type": "Show",
    "windowMarkup.file": "files/panel.xaml",
    "dataMapping": "title={标题}",
    "windowId": "float-win"
  },
  "outputParams": {
    "isSuccess": "成功",
    "windowHandle": "句柄"
  }
}
```

### 关闭窗口

```json
{
  "stepRunnerKey": "sys:customwindow",
  "inputParams": {
    "type": "Close",
    "windowId": "demo-win"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

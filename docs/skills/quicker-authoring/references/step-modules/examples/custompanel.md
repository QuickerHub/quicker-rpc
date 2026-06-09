# sys:custompanel

> **来源**：step JSON 示例 · **官方**：[custompanel](https://getquicker.net/KC/Help/Doc/custompanel)

**用途**：浮动操作面板（多按钮、可重复点击）。

## 示例

### 显示操作窗

```json
{
  "stepRunnerKey": "sys:custompanel",
  "inputParams": {
    "operation": "Show",
    "operationData": "[fa:Light_Play]运行|operation=run&data=notepad\n[fa:Light_Globe]百度|operation=open&data=https://baidu.com",
    "windowId": "my-panel"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 显示并等待关闭

```json
{
  "stepRunnerKey": "sys:custompanel",
  "inputParams": {
    "operation": "ShowAndWaitClose",
    "operationData": "确定|operation=close&data=ok\n取消|operation=close&data=cancel",
    "windowId": "confirm-panel"
  },
  "outputParams": {
    "isSuccess": "成功",
    "selectedItemData": "选中项数据"
  }
}
```

### 关闭指定面板

```json
{
  "stepRunnerKey": "sys:custompanel",
  "inputParams": {
    "operation": "Close",
    "windowId": "my-panel"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

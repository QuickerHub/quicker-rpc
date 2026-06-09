# sys:waitClipboardChange

> **来源**：step JSON 示例 · **官方**：[waitclipboardchange](https://getquicker.net/KC/Help/Doc/waitclipboardchange)

**用途**：等待剪贴板内容发生变化。

## 示例

### 等待变更

```json
{
  "stepRunnerKey": "sys:waitClipboardChange",
  "inputParams": {
    "maxWaitSeconds": "30"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 忽略近期变更

```json
{
  "stepRunnerKey": "sys:waitClipboardChange",
  "inputParams": {
    "maxWaitSeconds": "60",
    "recentChangeMs": "500",
    "monitorWaitWin": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

# sys:delay

> **来源**：step JSON 示例 · **官方**：[delay](https://getquicker.net/KC/Help/Doc/delay)

**用途**：暂停动作执行指定毫秒。

## 示例

### 延迟 500ms

```json
{
  "stepRunnerKey": "sys:delay",
  "inputParams": {
    "delayMs": 500
  }
}
```

### 长延迟并监控等待窗

```json
{
  "stepRunnerKey": "sys:delay",
  "inputParams": {
    "delayMs": 3000,
    "monitorWaitWin": true
  }
}
```

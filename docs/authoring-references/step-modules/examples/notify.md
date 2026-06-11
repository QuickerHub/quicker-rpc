# sys:notify

> **来源**：step JSON 示例 · **官方**：[notify](https://getquicker.net/KC/Help/Doc/notify)

**用途**：在屏幕角落显示 Quicker 通知气泡。

## 示例

### 简短提示

```json
{
  "stepRunnerKey": "sys:notify",
  "inputParams": {
    "type": "Default",
    "msg": "任务已完成"
  }
}
```

### 多行通知

```json
{
  "stepRunnerKey": "sys:notify",
  "inputParams": {
    "type": "Default",
    "msg.var": "详情",
    "maxLines": "5"
  }
}
```

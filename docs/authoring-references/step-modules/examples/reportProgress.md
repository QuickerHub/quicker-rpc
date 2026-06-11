# sys:reportProgress

> **来源**：step JSON 示例 · **官方**：[reportprogress](https://getquicker.net/KC/Help/Doc/reportprogress)

**用途**：在 Quicker 进度条中显示任务进度。

## 示例

### 申请进度条 ID

```json
{
  "stepRunnerKey": "sys:reportProgress",
  "inputParams": {
    "type": "REQUEST_ID",
    "title": "处理中…"
  },
  "outputParams": {
    "progressId": "进度ID"
  }
}
```

### 更新进度

```json
{
  "stepRunnerKey": "sys:reportProgress",
  "inputParams": {
    "type": "UPDATE_PROGRESS",
    "progressId.var": "进度ID",
    "percentage.var": "百分比",
    "text.var": "状态文本"
  }
}
```

### 移除进度条

```json
{
  "stepRunnerKey": "sys:reportProgress",
  "inputParams": {
    "type": "REMOVE",
    "progressId.var": "进度ID"
  }
}
```

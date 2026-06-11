# sys:manageList

> **来源**：step JSON 示例 · **官方**：[managelist](https://getquicker.net/KC/Help/Doc/managelist)

**用途**：弹出列表管理窗口，支持增删改条目。

## 示例

### 管理文本列表

```json
{
  "stepRunnerKey": "sys:manageList",
  "inputParams": {
    "list.var": "任务列表",
    "winTitle": "编辑任务",
    "allowAdd": "1",
    "allowEdit": "1",
    "allowDelete": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 只读查看

```json
{
  "stepRunnerKey": "sys:manageList",
  "inputParams": {
    "list.var": "日志列表",
    "winTitle": "查看记录",
    "allowAdd": "0",
    "allowEdit": "0",
    "allowDelete": "0"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

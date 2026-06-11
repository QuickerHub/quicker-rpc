# sys:getActionInfo

> **来源**：step JSON 示例 · **官方**：[getactioninfo](https://getquicker.net/KC/Help/Doc/getactioninfo)

**用途**：读取当前或指定 ID 的动作信息（本机 `step-runner get` 可能不可用，键名以设计器为准）。

## 示例

### 按动作 ID 查询

```json
{
  "stepRunnerKey": "sys:getActionInfo",
  "inputParams": {
    "target": "byId",
    "actionId.var": "动作ID"
  },
  "outputParams": {
    "title": "动作名"
  }
}
```

### 读取当前运行动作

```json
{
  "stepRunnerKey": "sys:getActionInfo",
  "inputParams": {
    "target": "current"
  },
  "outputParams": {
    "title": "动作名",
    "sharedActionId": "共享ID"
  }
}
```

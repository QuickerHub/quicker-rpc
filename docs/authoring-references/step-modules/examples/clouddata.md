# sys:clouddata

> **来源**：step JSON 示例 · **官方**：[clouddata](https://getquicker.net/KC/Help/Doc/clouddata)

**用途**：按全局键名读写 Quicker 云状态（文本；勿在循环中高频调用）。

## 示例

### 从网络读取状态

```json
{
  "stepRunnerKey": "sys:clouddata",
  "inputParams": {
    "type": "readGlobalState",
    "key": "my_action_last_path"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "状态值",
    "errCode": "错误码"
  }
}
```

### 写入状态

```json
{
  "stepRunnerKey": "sys:clouddata",
  "inputParams": {
    "type": "saveGlobalState",
    "key": "my_action_last_path",
    "value.var": "当前路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 删除状态（写入 *NULL*）

```json
{
  "stepRunnerKey": "sys:clouddata",
  "inputParams": {
    "type": "saveGlobalState",
    "key": "my_action_last_path",
    "value": "*NULL*"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

# sys:stateStorage

> **来源**：step JSON 示例 · **官方**：[statestorage](https://getquicker.net/KC/Help/Doc/statestorage)

**用途**：读写动作本地状态、徽章与叠加图标。

## 示例

### 读取状态

```json
{
  "stepRunnerKey": "sys:stateStorage",
  "inputParams": {
    "operation": "readActionState",
    "key": "lastPath",
    "defaultValue": ""
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "值",
    "isEmpty": "为空"
  }
}
```

### 保存状态

```json
{
  "stepRunnerKey": "sys:stateStorage",
  "inputParams": {
    "operation": "saveActionState",
    "key": "lastPath",
    "value.var": "路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 更新徽章

```json
{
  "stepRunnerKey": "sys:stateStorage",
  "inputParams": {
    "operation": "UpdateActionBadge",
    "badgeText.var": "徽章文字",
    "badgeColor": "#FF5722",
    "badgeTextColor": "#FFFFFF"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

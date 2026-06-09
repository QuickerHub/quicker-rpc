# sys:imeControl

> **来源**：step JSON 示例 · **官方**：[imecontrol](https://getquicker.net/KC/Help/Doc/imecontrol)

**用途**：启用/禁用/恢复输入法，或查询当前 IME 状态。

## 示例

### 禁用输入法

```json
{
  "stepRunnerKey": "sys:imeControl",
  "inputParams": {
    "operation": "DISABLE"
  },
  "outputParams": {
    "isEnabled": "是否启用"
  }
}
```

### 恢复输入法

```json
{
  "stepRunnerKey": "sys:imeControl",
  "inputParams": {
    "operation": "RESTORE"
  },
  "outputParams": {
    "isEnabled": "是否启用"
  }
}
```

### 查询状态

```json
{
  "stepRunnerKey": "sys:imeControl",
  "inputParams": {
    "operation": "GET_STATE"
  },
  "outputParams": {
    "isEnabled": "是否启用"
  }
}
```

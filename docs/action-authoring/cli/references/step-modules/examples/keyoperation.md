# sys:keyoperation

> **来源**：step JSON 示例 · **官方**：[keyoperation](https://getquicker.net/KC/Help/Doc/keyoperation)

**用途**：查询或模拟单个键的按下/抬起状态。

## 示例

### 按下键

```json
{
  "stepRunnerKey": "sys:keyoperation",
  "inputParams": {
    "type": "key_down",
    "key": "Shift"
  },
  "outputParams": {
    "isDown": "是否按下"
  }
}
```

### 抬起键

```json
{
  "stepRunnerKey": "sys:keyoperation",
  "inputParams": {
    "type": "key_up",
    "key": "Shift"
  },
  "outputParams": {
    "isDown": "是否按下"
  }
}
```

### 查询键状态

```json
{
  "stepRunnerKey": "sys:keyoperation",
  "inputParams": {
    "type": "get_key_state",
    "key": "CapsLock"
  },
  "outputParams": {
    "isToggled": "是否切换"
  }
}
```

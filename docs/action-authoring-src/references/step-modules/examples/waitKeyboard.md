# sys:waitKeyboard

> **来源**：step JSON 示例 · **官方**：[waitkeyboard](https://getquicker.net/KC/Help/Doc/waitkeyboard)

**用途**：等待用户按下指定按键或组合键。

## 示例

### 等待单键

```json
{
  "stepRunnerKey": "sys:waitKeyboard",
  "inputParams": {
    "operation": "waitKeyDown",
    "waitingKeys": "F9",
    "maxWaitSeconds": "0"
  },
  "outputParams": {
    "isSuccess": "成功",
    "keyCode": "键码",
    "keyValue": "键名"
  }
}
```

### 等待组合键

```json
{
  "stepRunnerKey": "sys:waitKeyboard",
  "inputParams": {
    "operation": "waitKeyDown",
    "waitingKeys": "C",
    "modifierKeys": "Ctrl",
    "waitKeyUp": "1"
  },
  "outputParams": {
    "holdTimeMs": "按住时长"
  }
}
```

### 等待全部松开

```json
{
  "stepRunnerKey": "sys:waitKeyboard",
  "inputParams": {
    "operation": "waitAllKeyUp",
    "maxWaitSeconds": "10"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

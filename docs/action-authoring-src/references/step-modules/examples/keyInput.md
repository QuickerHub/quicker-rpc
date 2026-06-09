# sys:keyInput

> **来源**：step JSON 示例 · **官方**：[keyinput](https://getquicker.net/KC/Help/Doc/keyinput)

**用途**：模拟键盘按键或组合键输入。

## 示例

### 发送 Ctrl+C

```json
{
  "stepRunnerKey": "sys:keyInput",
  "inputParams": {
    "keys": "{Ctrl}c"
  }
}
```

### 重复按键

```json
{
  "stepRunnerKey": "sys:keyInput",
  "inputParams": {
    "keys": "{Down}",
    "repeat": "5",
    "interval": "50"
  }
}
```

### 输入文本与回车

```json
{
  "stepRunnerKey": "sys:keyInput",
  "inputParams": {
    "keys": "hello{Enter}"
  }
}
```

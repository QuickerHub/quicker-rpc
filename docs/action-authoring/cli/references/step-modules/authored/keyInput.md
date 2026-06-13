# sys:keyInput

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[keyinput](https://getquicker.net/KC/Help/Doc/keyinput)

**用途**：模拟固定键盘按键/组合键（模拟按键 A）；复杂动态序列用 `sendKeys`。

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
    "repeat": 5,
    "interval": 50
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

## 陷阱

- `keys` 为 Keyboard 类型：`{Ctrl}` `{Alt}` `{Shift}` `{Win}` + 键名；纯文本与 `{Enter}` 等可混写。
- 输入法可能干扰，可前置 `imeControl` DISABLE/RESTORE；部分软件不响应时可增大 `holdMs` 或改 `sendKeys` / `keyoperation` 分步 down-up。
- 不支持鼠标键；多步输入脚本用 `inputScript`。

## 相关

sendKeys · imeControl · keyoperation · inputScript · delay · step-runner-get

# sys:keyInput

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[keyinput](https://getquicker.net/KC/Help/Doc/keyinput)

**用途**：模拟固定键盘按键/组合键（模拟按键 A）；复杂或动态序列用 `sendKeys`。

## Wire 格式（必读）

`keys` 参数值为 **JSON**（`KeyInputStepData`），**不是** SendKeys B 的 `{Ctrl}c` 语法：

```json
{"CtrlKeys":[17],"Keys":[67]}
```

| 字段 | 类型 | 含义 |
|------|------|------|
| `CtrlKeys` | `number[]` | 修饰键 Windows VK 码（Ctrl/Alt/Shift/Win） |
| `Keys` | `number[]` | 普通键 VK 码 |

常见 VK：`17`=Ctrl，`18`=Alt，`16`=Shift，`91`=Win，`67`=C，`68`=D，`13`=Enter，`40`=Down。

选择器写入通用修饰码（Ctrl=17）；录制保留左右区分（如 LeftCtrl=162）。

## 示例

### 发送 Ctrl+C

```json
{
  "stepRunnerKey": "sys:keyInput",
  "inputParams": {
    "keys": { "value": "{\"CtrlKeys\":[17],\"Keys\":[67]}" }
  }
}
```

### 重复按 Down

```json
{
  "stepRunnerKey": "sys:keyInput",
  "inputParams": {
    "keys": { "value": "{\"CtrlKeys\":[],\"Keys\":[40]}" },
    "repeat": { "value": "5" },
    "interval": { "value": "50" }
  }
}
```

### 仅 Enter

```json
{
  "stepRunnerKey": "sys:keyInput",
  "inputParams": {
    "keys": { "value": "{\"CtrlKeys\":[],\"Keys\":[13]}" }
  }
}
```

## Agent 速查表

| 意图 | `keys.value`（JSON 字符串） |
|------|----------------------------|
| Ctrl+C | `{"CtrlKeys":[17],"Keys":[67]}` |
| Ctrl+V | `{"CtrlKeys":[17],"Keys":[86]}` |
| Ctrl+Shift+S | `{"CtrlKeys":[17,16],"Keys":[83]}` |
| Win+Shift+S | `{"CtrlKeys":[91,16],"Keys":[83]}` |
| Enter | `{"CtrlKeys":[],"Keys":[13]}` |
| Down ×N | `{"CtrlKeys":[],"Keys":[40]}` + `repeat` / `interval` |

显示名示例：`Ctrl+ [ C ]`（摘要/UI）；空键：`{"CtrlKeys":[],"Keys":[]}`。

## 陷阱

- **勿用** `{Ctrl}c`、`^c`、`hello{Enter}` — 那是 `sys:sendKeys`。
- 纯文本或多步脚本 → `sendKeys` 或 `inputScript`。
- 输入法可能干扰 → 前置 `imeControl`；不响应时增大 `holdMs` 或改 `sendKeys` / `keyoperation`。
- 不支持鼠标键。

## 相关

sendKeys · imeControl · keyoperation · inputScript · delay · step-runner-get

# sys:userInput

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[userinput](https://getquicker.net/KC/Help/Doc/userinput)

**用途**：弹出输入框让用户输入文本、数字或日期时间。

## 示例

### 单行文本

```json
{
  "stepRunnerKey": "sys:userInput",
  "inputParams": {
    "type": "text",
    "prompt": "请输入名称",
    "defaultValue.var": "默认值"
  },
  "outputParams": {
    "isSuccess": "成功",
    "textValue": "输入内容",
    "isEmpty": "为空"
  }
}
```

### 数字输入

```json
{
  "stepRunnerKey": "sys:userInput",
  "inputParams": {
    "type": "number",
    "prompt": "请输入数量",
    "defaultValue": "1"
  },
  "outputParams": {
    "numberValue": "数字值"
  }
}
```

### 多行文本

```json
{
  "stepRunnerKey": "sys:userInput",
  "inputParams": {
    "type": "multiline",
    "prompt": "请输入备注",
    "submitWithReturn": true
  },
  "outputParams": {
    "textValue": "输入内容"
  }
}
```

## 陷阱

- `type`: `text`/`multiline`/`number`/`date_time`；数字读 `numberValue`，日期读 `datetimeValue`。
- `pattern` 正则校验；`stopIfFail` 取消时停动作；`liveRun: false`。
- 写步骤前 `get --control-field text` 等。

## 相关

select · stateStorage · textSelectTools · step-runner-get

# sys:userInput

> **来源**：step JSON 示例 · **官方**：[userinput](https://getquicker.net/KC/Help/Doc/userinput)

**用途**：弹出输入框让用户输入文本、数字或日期时间。

## 示例

### 单行文本

```json
{
  "stepRunnerKey": "sys:userInput",
  "inputParams": {
    "type": "text",
    "prompt": "请输入名称",
    "defaultValue.var": "默认值",
    "isRequired": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "textValue": "输入值",
    "isEmpty": "为空"
  }
}
```

### 多行文本

```json
{
  "stepRunnerKey": "sys:userInput",
  "inputParams": {
    "type": "multiline",
    "prompt": "备注",
    "defaultValue.var": "草稿"
  },
  "outputParams": {
    "textValue": "输入值"
  }
}
```

### 数字输入

```json
{
  "stepRunnerKey": "sys:userInput",
  "inputParams": {
    "type": "number",
    "prompt": "数量",
    "defaultValue": "1",
    "pattern": "^[0-9]+$"
  },
  "outputParams": {
    "numberValue": "数值"
  }
}
```

### 日期时间

```json
{
  "stepRunnerKey": "sys:userInput",
  "inputParams": {
    "type": "date_time",
    "prompt": "选择时间"
  },
  "outputParams": {
    "datetimeValue": "日期时间"
  }
}
```

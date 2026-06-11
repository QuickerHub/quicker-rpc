# sys:outputText

> **来源**：step JSON 示例 · **官方**：[outputtext](https://getquicker.net/KC/Help/Doc/outputtext)

**用途**：向焦点控件模拟键入或粘贴文本。

## 示例

### 模拟键入

```json
{
  "stepRunnerKey": "sys:outputText",
  "inputParams": {
    "content.var": "要输入的文本",
    "method": "input"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 粘贴模式

```json
{
  "stepRunnerKey": "sys:outputText",
  "inputParams": {
    "content.var": "长文本",
    "method": "paste",
    "delayBeforePaste": "100"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

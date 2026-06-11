# sys:getSelectedText

> **来源**：step JSON 示例 · **官方**：[get_selected_text](https://getquicker.net/KC/Help/Doc/get_selected_text)

**用途**：模拟 Ctrl+C 获取当前选中文本（也可用动作参数传入）。

## 示例

### 获取纯文本

```json
{
  "stepRunnerKey": "sys:getSelectedText",
  "inputParams": {
    "format": "UnicodeText",
    "trim": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "选中文本"
  }
}
```

### 获取 HTML 并提取纯文本

```json
{
  "stepRunnerKey": "sys:getSelectedText",
  "inputParams": {
    "format": "Html",
    "waitMs": 500
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "原始HTML",
    "cleanHtml": "纯文本"
  }
}
```

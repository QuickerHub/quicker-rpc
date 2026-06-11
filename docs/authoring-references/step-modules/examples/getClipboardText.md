# sys:getClipboardText

> **来源**：step JSON 示例 · **官方**：[getclipboardtext](https://getquicker.net/KC/Help/Doc/getclipboardtext)

**用途**：读取剪贴板文本（可选格式与编码）。

## 示例

### Unicode 纯文本

```json
{
  "stepRunnerKey": "sys:getClipboardText",
  "outputParams": {
    "isSuccess": "成功",
    "output": "剪贴板文本"
  }
}
```

### 读取 HTML 并清理

```json
{
  "stepRunnerKey": "sys:getClipboardText",
  "inputParams": {
    "format": "Html"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "原始HTML",
    "cleanHtml": "纯文本"
  }
}
```

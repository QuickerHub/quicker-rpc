# sys:writeClipboard

> **来源**：step JSON 示例 · **官方**：[writeclipboard](https://getquicker.net/KC/Help/Doc/writeclipboard)

**用途**：将文本、HTML、图片等写入剪贴板。

## 示例

### 写入纯文本

```json
{
  "stepRunnerKey": "sys:writeClipboard",
  "inputParams": {
    "type": "text",
    "text.var": "内容"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 写入 HTML

```json
{
  "stepRunnerKey": "sys:writeClipboard",
  "inputParams": {
    "type": "html",
    "html.var": "HTML内容",
    "text.var": "纯文本备用"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 写入图片变量

```json
{
  "stepRunnerKey": "sys:writeClipboard",
  "inputParams": {
    "type": "image",
    "imageVar.var": "截图"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 清空剪贴板

```json
{
  "stepRunnerKey": "sys:writeClipboard",
  "inputParams": {
    "type": "clear"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

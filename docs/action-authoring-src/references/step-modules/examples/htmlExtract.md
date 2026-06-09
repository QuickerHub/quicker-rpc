# sys:htmlExtract

> **来源**：step JSON 示例 · **官方**：[htmlextract](https://getquicker.net/KC/Help/Doc/htmlextract)

**用途**：XPath 从 HTML/XML 文本或 URL 提取节点内容。

## 示例

### 提取页面标题

```json
{
  "stepRunnerKey": "sys:htmlExtract",
  "inputParams": {
    "operation": "extractText",
    "source.var": "HTML",
    "xpath": "//title"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "标题"
  }
}
```

### 从 URL 提取全部链接文本

```json
{
  "stepRunnerKey": "sys:htmlExtract",
  "inputParams": {
    "operation": "extractText",
    "source": "https://example.com",
    "xpath": "//a",
    "selectTarget": "all",
    "returnType": "InnerText"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "链接文本列表"
  }
}
```

### 提取表格为列表

```json
{
  "stepRunnerKey": "sys:htmlExtract",
  "inputParams": {
    "operation": "extractTable",
    "source.var": "页面HTML",
    "xpath": "//table[@id='data']"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "表格行列表"
  }
}
```

# sys:textCounter

> **来源**：step JSON 示例 · **官方**：[textcounter](https://getquicker.net/KC/Help/Doc/textcounter)

**用途**：统计文本行数、字符数及中文数量。

## 示例

### 统计全文

```json
{
  "stepRunnerKey": "sys:textCounter",
  "inputParams": {
    "content.var": "文本"
  },
  "outputParams": {
    "line": "行数",
    "char": "字符数",
    "cnChar": "中文字数"
  }
}
```

### 统计可见字符

```json
{
  "stepRunnerKey": "sys:textCounter",
  "inputParams": {
    "content.var": "文本"
  },
  "outputParams": {
    "visableChar": "可见字符数",
    "char": "总字符数"
  }
}
```

# sys:textCounter

> **分类**：文本 · **来源**：仓库手写 · **官方**：[textcounter](https://getquicker.net/KC/Help/Doc/textcounter)

**用途**：统计文本行数、字符数、可见字符数、汉字数。

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

## 陷阱

- 输出键 `visableChar` 为 Quicker 原拼写（非 visible）；无 controlField，单参数 `content`。
- 复杂统计可用 `evalexpression`。

## 相关

outputText · evalexpression · step-runner-get

# sys:stringProcess

> **来源**：step JSON 示例 · **官方**：[stringprocess](https://getquicker.net/KC/Help/Doc/stringprocess)

**用途**：常见字符串变换（大小写、截取、编码等）。

## 示例

### 转大写

```json
{
  "stepRunnerKey": "sys:stringProcess",
  "inputParams": {
    "method": "toUpper",
    "data.var": "文本"
  },
  "outputParams": {
    "output": "结果",
    "isSuccess": "成功"
  }
}
```

### 截取子串

```json
{
  "stepRunnerKey": "sys:stringProcess",
  "inputParams": {
    "method": "substring",
    "data.var": "文本",
    "start": "0",
    "length": "10"
  },
  "outputParams": {
    "output": "结果"
  }
}
```

### 反转

```json
{
  "stepRunnerKey": "sys:stringProcess",
  "inputParams": {
    "method": "reverse",
    "data.var": "文本"
  },
  "outputParams": {
    "output": "结果"
  }
}
```

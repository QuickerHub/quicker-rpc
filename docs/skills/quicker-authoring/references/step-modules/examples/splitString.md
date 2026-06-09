# sys:splitString

> **来源**：step JSON 示例 · **官方**：[splitstring](https://getquicker.net/KC/Help/Doc/splitstring)

**用途**：按分隔符将文本拆分为列表。

## 示例

### 按逗号拆分

```json
{
  "stepRunnerKey": "sys:splitString",
  "inputParams": {
    "data.var": "文本",
    "separator": ","
  },
  "outputParams": {
    "output": "列表"
  }
}
```

### 多字符分隔符

```json
{
  "stepRunnerKey": "sys:splitString",
  "inputParams": {
    "data.var": "文本",
    "separator": "||",
    "multiSeparator": "1",
    "removeEmpty": "1"
  },
  "outputParams": {
    "output": "列表"
  }
}
```

### 转义分隔符

```json
{
  "stepRunnerKey": "sys:splitString",
  "inputParams": {
    "data.var": "文本",
    "separator": "\\n",
    "escapeSeparator": "1"
  },
  "outputParams": {
    "output": "列表"
  }
}
```

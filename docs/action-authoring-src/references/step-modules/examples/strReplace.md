# sys:strReplace

> **来源**：step JSON 示例 · **官方**：[strreplace](https://getquicker.net/KC/Help/Doc/strreplace)

**用途**：单次或批量替换文本内容。

## 示例

### 单次替换

```json
{
  "stepRunnerKey": "sys:strReplace",
  "inputParams": {
    "type": "single",
    "input.var": "原文",
    "old": "foo",
    "new": "bar"
  },
  "outputParams": {
    "output": "结果"
  }
}
```

### 正则替换

```json
{
  "stepRunnerKey": "sys:strReplace",
  "inputParams": {
    "type": "single",
    "input.var": "原文",
    "old": "\\d+",
    "new": "#",
    "useRegex": "1"
  },
  "outputParams": {
    "output": "结果"
  }
}
```

### 批量替换

```json
{
  "stepRunnerKey": "sys:strReplace",
  "inputParams": {
    "type": "batch",
    "input.var": "原文",
    "batchReplaceData": "old1|new1\nold2|new2"
  },
  "outputParams": {
    "output": "结果"
  }
}
```

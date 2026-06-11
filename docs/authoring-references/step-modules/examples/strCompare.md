# sys:strCompare

> **来源**：step JSON 示例 · **官方**：[strcompare](https://getquicker.net/KC/Help/Doc/strcompare)

**用途**：比较两段文本并输出布尔结果。

## 示例

### 相等

```json
{
  "stepRunnerKey": "sys:strCompare",
  "inputParams": {
    "type": "=",
    "param1.var": "文本A",
    "param2.var": "文本B"
  },
  "outputParams": {
    "value": "比较结果"
  }
}
```

### 包含（忽略大小写）

```json
{
  "stepRunnerKey": "sys:strCompare",
  "inputParams": {
    "type": "contains",
    "param1.var": "Haystack",
    "param2": "needle",
    "case": "0"
  },
  "outputParams": {
    "value": "比较结果"
  }
}
```

### 字典序大于

```json
{
  "stepRunnerKey": "sys:strCompare",
  "inputParams": {
    "type": ">",
    "param1.var": "版本A",
    "param2.var": "版本B"
  },
  "outputParams": {
    "value": "比较结果"
  }
}
```

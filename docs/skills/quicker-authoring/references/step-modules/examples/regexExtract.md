# sys:regexExtract

> **来源**：step JSON 示例 · **官方**：[regexextract](https://getquicker.net/KC/Help/Doc/regexextract)

**用途**：正则匹配提取文本或捕获组。

## 示例

### 提取所有匹配值

```json
{
  "stepRunnerKey": "sys:regexExtract",
  "inputParams": {
    "getGroup": "0",
    "data.var": "原文",
    "pattern": "\\d+"
  },
  "outputParams": {
    "isSuccess": "成功",
    "matches": "匹配列表",
    "match1": "首个匹配"
  }
}
```

### 提取第一个匹配的捕获组

```json
{
  "stepRunnerKey": "sys:regexExtract",
  "inputParams": {
    "getGroup": "1",
    "data.var": "日志行",
    "pattern": "id=(\\w+)",
    "ignoreCase": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "match1": "ID"
  }
}
```

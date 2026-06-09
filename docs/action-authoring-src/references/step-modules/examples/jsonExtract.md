# sys:jsonExtract

> **来源**：step JSON 示例 · **官方**：[jsonextract](https://getquicker.net/KC/Help/Doc/jsonextract)

**用途**：从 JSON 文本或 JToken 按路径提取最多 5 个字段。

## 示例

### 提取单个字段

```json
{
  "stepRunnerKey": "sys:jsonExtract",
  "inputParams": {
    "data.var": "JSON文本",
    "p0": "data.title"
  },
  "outputParams": {
    "isSuccess": "成功",
    "v0": "标题",
    "rootToken": "根对象"
  }
}
```

### 提取多个字段

```json
{
  "stepRunnerKey": "sys:jsonExtract",
  "inputParams": {
    "data.var": "响应JSON",
    "p0": "items[0].id",
    "p1": "items[0].name"
  },
  "outputParams": {
    "isSuccess": "成功",
    "v0": "ID",
    "v1": "名称"
  }
}
```

### 强制数组提取

```json
{
  "stepRunnerKey": "sys:jsonExtract",
  "inputParams": {
    "data.var": "JSON文本",
    "p0": "list:$.tags[*]"
  },
  "outputParams": {
    "isSuccess": "成功",
    "v0": "标签列表"
  }
}
```

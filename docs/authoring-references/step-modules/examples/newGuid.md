# sys:newGuid

> **来源**：step JSON 示例 · **官方**：[newguid](https://getquicker.net/KC/Help/Doc/newguid)

**用途**：生成 GUID 字符串。

## 示例

### 标准 GUID

```json
{
  "stepRunnerKey": "sys:newGuid",
  "outputParams": {
    "output": "新ID"
  }
}
```

### 大写无连字符

```json
{
  "stepRunnerKey": "sys:newGuid",
  "inputParams": {
    "format": "N",
    "upper": "1"
  },
  "outputParams": {
    "output": "新ID"
  }
}
```

# sys:joinList

> **来源**：step JSON 示例 · **官方**：[joinlist](https://getquicker.net/KC/Help/Doc/joinlist)

**用途**：用分隔符将列表合并为文本。

## 示例

### 逗号连接

```json
{
  "stepRunnerKey": "sys:joinList",
  "inputParams": {
    "list.var": "标签列表",
    "separator": ","
  },
  "outputParams": {
    "output": "合并文本"
  }
}
```

### 换行连接

```json
{
  "stepRunnerKey": "sys:joinList",
  "inputParams": {
    "list.var": "行列表",
    "separator": "\n"
  },
  "outputParams": {
    "output": "多行文本"
  }
}
```

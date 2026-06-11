# sys:WriteTextFile

> **来源**：step JSON 示例 · **官方**：[writetextfile](https://getquicker.net/KC/Help/Doc/writetextfile)

**用途**：将文本写入文件（覆盖或追加）。

## 示例

### 覆盖写入 UTF-8

```json
{
  "stepRunnerKey": "sys:WriteTextFile",
  "inputParams": {
    "content.var": "内容",
    "filePath.var": "文件路径",
    "encoding": "utf-8",
    "addUtf8Bom": "0"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 追加一行

```json
{
  "stepRunnerKey": "sys:WriteTextFile",
  "inputParams": {
    "content.var": "日志行",
    "filePath.var": "日志文件",
    "appendMode": "1",
    "addNewLine": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 系统默认编码

```json
{
  "stepRunnerKey": "sys:WriteTextFile",
  "inputParams": {
    "content": "hello",
    "filePath.var": "文件路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

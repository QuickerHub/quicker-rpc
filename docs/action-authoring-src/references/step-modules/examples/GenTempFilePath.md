# sys:GenTempFilePath

> **来源**：step JSON 示例 · **官方**：[gentempfilepath](https://getquicker.net/KC/Help/Doc/gentempfilepath)

**用途**：按扩展名生成随机临时文件完整路径。

## 示例

### 临时文本文件

```json
{
  "stepRunnerKey": "sys:GenTempFilePath",
  "inputParams": {
    "ext": ".txt"
  },
  "outputParams": {
    "filePath": "临时路径"
  }
}
```

### 临时 JSON 文件

```json
{
  "stepRunnerKey": "sys:GenTempFilePath",
  "inputParams": {
    "ext": "json"
  },
  "outputParams": {
    "filePath": "临时路径"
  }
}
```

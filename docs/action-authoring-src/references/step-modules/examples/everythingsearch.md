# sys:everythingsearch

> **来源**：step JSON 示例 · **官方**：[everythingsearch](https://getquicker.net/KC/Help/Doc/everythingsearch)

**用途**：通过 Everything 搜索本机文件（需已安装并运行）。

## 示例

### 关键词搜索

```json
{
  "stepRunnerKey": "sys:everythingsearch",
  "inputParams": {
    "search": "readme",
    "maxCount": 50
  },
  "outputParams": {
    "isSuccess": "成功",
    "pathList": "路径列表",
    "resultCount": "数量"
  }
}
```

### 限定目录与扩展名

```json
{
  "stepRunnerKey": "sys:everythingsearch",
  "inputParams": {
    "search": "report",
    "folder": "D:\\Work\\",
    "ext": "pdf;docx"
  },
  "outputParams": {
    "isSuccess": "成功",
    "pathList": "路径列表"
  }
}
```

### 完整文件名匹配

```json
{
  "stepRunnerKey": "sys:everythingsearch",
  "inputParams": {
    "search": "config.json",
    "matchWholeFilename": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "rawResult": "原始结果"
  }
}
```

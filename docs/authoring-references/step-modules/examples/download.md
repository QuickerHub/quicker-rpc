# sys:download

> **来源**：step JSON 示例 · **官方**：[download](https://getquicker.net/KC/Help/Doc/download)

**用途**：从 URL 下载文件到本地。

## 示例

### 下载到指定路径

```json
{
  "stepRunnerKey": "sys:download",
  "inputParams": {
    "url": "https://example.com/file.zip",
    "savePath.var": "保存目录",
    "saveName": "archive.zip",
    "autoRename": "1"
  },
  "outputParams": {
    "savedPath": "完整路径"
  }
}
```

### 下载到系统下载目录

```json
{
  "stepRunnerKey": "sys:download",
  "inputParams": {
    "url.var": "下载链接",
    "showProgress": "1"
  },
  "outputParams": {
    "savedPath": "完整路径"
  }
}
```

### 带 Cookie 鉴权下载

```json
{
  "stepRunnerKey": "sys:download",
  "inputParams": {
    "url": "https://api.example.com/export",
    "header": "Cookie: session={Cookie}",
    "saveName": "export.csv"
  },
  "outputParams": {
    "savedPath": "完整路径"
  }
}
```

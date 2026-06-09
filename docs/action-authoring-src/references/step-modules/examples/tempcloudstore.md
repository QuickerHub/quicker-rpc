# sys:tempcloudstore

> **来源**：step JSON 示例 · **官方**：[tempcloudstore](https://getquicker.net/KC/Help/Doc/tempcloudstore)

**用途**：将文本、文件或图片上传到 Quicker 临时云存储并获取 URL。

## 示例

### 上传文本

```json
{
  "stepRunnerKey": "sys:tempcloudstore",
  "inputParams": {
    "dataType": "text",
    "text.var": "内容",
    "expireSeconds": "86400"
  },
  "outputParams": {
    "isSuccess": "成功",
    "url": "链接"
  }
}
```

### 上传文件

```json
{
  "stepRunnerKey": "sys:tempcloudstore",
  "inputParams": {
    "dataType": "file",
    "file.var": "文件路径",
    "useRandomFileName": "1"
  },
  "outputParams": {
    "url": "链接"
  }
}
```

### 上传图片变量

```json
{
  "stepRunnerKey": "sys:tempcloudstore",
  "inputParams": {
    "dataType": "imageVar",
    "imageVar.var": "截图"
  },
  "outputParams": {
    "isSuccess": "成功",
    "url": "链接"
  }
}
```

# sys:http

> **来源**：step JSON 示例 · **官方**：[http](https://getquicker.net/KC/Help/Doc/http)

**用途**：发送 HTTP 请求并读取文本/图片/文件响应。

## 示例

### GET 文本

```json
{
  "stepRunnerKey": "sys:http",
  "inputParams": {
    "url": "https://api.example.com/status",
    "method": "GET",
    "resultType": "Text"
  },
  "outputParams": {
    "isSuccess": "成功",
    "statusCode": "状态码",
    "content": "响应体"
  }
}
```

### POST JSON

```json
{
  "stepRunnerKey": "sys:http",
  "inputParams": {
    "url": "https://api.example.com/items",
    "method": "POST",
    "bodyType": "JSON",
    "body": "{\"title\":\"test\"}",
    "resultType": "Text"
  },
  "outputParams": {
    "isSuccess": "成功",
    "content": "响应体"
  }
}
```

### POST 表单

```json
{
  "stepRunnerKey": "sys:http",
  "inputParams": {
    "url.var": "接口地址",
    "method": "POST",
    "bodyType": "FORM",
    "body": "$$mode=Bear&code=Decode&txt={原文}",
    "resultType": "Text"
  },
  "outputParams": {
    "isSuccess": "成功",
    "content": "结果"
  }
}
```

### 下载图片

```json
{
  "stepRunnerKey": "sys:http",
  "inputParams": {
    "url.var": "图片URL",
    "method": "GET",
    "resultType": "Image"
  },
  "outputParams": {
    "isSuccess": "成功",
    "imgResult": "图片"
  }
}
```

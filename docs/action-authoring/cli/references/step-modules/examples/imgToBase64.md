# sys:imgToBase64

> **来源**：step JSON 示例 · **官方**：[imgtobase64](https://getquicker.net/KC/Help/Doc/imgtobase64)

**用途**：图片与 Base64 文本互转。

## 示例

### 图片转 Base64

```json
{
  "stepRunnerKey": "sys:imgToBase64",
  "inputParams": {
    "type": "imgToBase64",
    "img.var": "图片",
    "addHeader": "1"
  },
  "outputParams": {
    "code": "Base64"
  }
}
```

### Base64 转图片

```json
{
  "stepRunnerKey": "sys:imgToBase64",
  "inputParams": {
    "type": "base64ToImg",
    "base64.var": "编码文本"
  },
  "outputParams": {
    "img": "图片"
  }
}
```

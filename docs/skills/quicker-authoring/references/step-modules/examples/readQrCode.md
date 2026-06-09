# sys:readQrCode

> **来源**：step JSON 示例 · **官方**：[readqrcode](https://getquicker.net/KC/Help/Doc/readqrcode)

**用途**：从图片识别二维码/条形码内容。

## 示例

### 识别单张图片

```json
{
  "stepRunnerKey": "sys:readQrCode",
  "inputParams": {
    "img.var": "图片"
  },
  "outputParams": {
    "isSuccess": "成功",
    "code": "内容"
  }
}
```

### 识别并返回全部码

```json
{
  "stepRunnerKey": "sys:readQrCode",
  "inputParams": {
    "img.var": "截图",
    "tryNetwork": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "codeList": "码列表",
    "barcodFormat": "格式"
  }
}
```

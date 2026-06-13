# sys:readQrCode

> **分类**：图片 · **来源**：仓库手写 · **官方**：[readqrcode](https://getquicker.net/KC/Help/Doc/readqrcode)

**用途**：从图片变量识别二维码/条形码文本。

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
    "tryNetwork": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "codeList": "码列表",
    "barcodFormat": "格式"
  }
}
```

## 陷阱

- 输入为**图片变量**（`img.var`）；多码同图用 `codeList`，单码用 `code`。
- `tryNetwork: true` 本地失败后走在线识别（专业版、有频率限制）；生成码用 `createQrCode`。

## 相关

createQrCode · screenCapture · readFile · basic-ocr · step-runner-get

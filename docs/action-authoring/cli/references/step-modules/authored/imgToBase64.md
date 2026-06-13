# sys:imgToBase64

> **分类**：图片 · **来源**：仓库手写 · **官方**：[imgtobase64](https://getquicker.net/KC/Help/Doc/imgtobase64)

**用途**：图片变量/文件与 Base64 文本互转。

## 示例

### 图片转 Base64

```json
{
  "stepRunnerKey": "sys:imgToBase64",
  "inputParams": {
    "type": "imgToBase64",
    "img.var": "图片",
    "addHeader": true
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

## 陷阱

- `imgToBase64` 的 `img` 可为图片变量（`img.var`）或**本地文件路径**；`addHeader: true` 前缀 `data:image/png;base64,`（嵌入 HTML/API 时用）。
- `base64ToImg` 只需 `base64` 纯编码文本（可含或不含 data URI 头，按 get purpose）；输出 `img` 为图片变量。

## 相关

WriteImageFile · readFile · http · createQrCode · step-runner-get

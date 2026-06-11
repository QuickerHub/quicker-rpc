# sys:basic-ocr

> **来源**：step JSON 示例 · **官方**：[basic-ocr](https://getquicker.net/KC/Help/Doc/basic-ocr)

**用途**：识别图片中的文字（多引擎/在线/离线）。

## 示例

### Quicker OCR 识别截图变量

```json
{
  "stepRunnerKey": "sys:basic-ocr",
  "inputParams": {
    "operation": "QuickerServerOcr",
    "imgVar.var": "截图",
    "lang": "CHN_ENG",
    "mergeChapter": "merge"
  },
  "outputParams": {
    "isSuccess": "成功",
    "content": "全文",
    "textList": "行列表"
  }
}
```

### Windows 内置 OCR

```json
{
  "stepRunnerKey": "sys:basic-ocr",
  "inputParams": {
    "operation": "WindowsOcr",
    "imgVar.var": "图片"
  },
  "outputParams": {
    "isSuccess": "成功",
    "content": "文本"
  }
}
```

### 表格识别（Quicker 服务）

```json
{
  "stepRunnerKey": "sys:basic-ocr",
  "inputParams": {
    "operation": "table_quicker",
    "imgVar.var": "表格图",
    "lang": "CHN_ENG"
  },
  "outputParams": {
    "isSuccess": "成功",
    "content": "表格文本"
  }
}
```

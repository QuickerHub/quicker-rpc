# sys:mathocr

> **来源**：step JSON 示例 · **官方**：[mathocr](https://getquicker.net/KC/Help/Doc/mathocr)

**用途**：调用 Mathpix 识别图片中的数学公式。

## 示例

### 识别图片变量

```json
{
  "stepRunnerKey": "sys:mathocr",
  "inputParams": {
    "vendor": "Mathpix",
    "image.var": "截图"
  },
  "outputParams": {
    "isSuccess": "成功",
    "latex": "Latex",
    "mathpixMarkdown": "MathpixMD"
  }
}
```

### 识别图片 URL

```json
{
  "stepRunnerKey": "sys:mathocr",
  "inputParams": {
    "vendor": "Mathpix",
    "image": "https://example.com/formula.png"
  },
  "outputParams": {
    "isSuccess": "成功",
    "latex": "公式"
  }
}
```

# sys:mathocr

> **分类**：图片 · **来源**：仓库手写 · **官方**：[mathocr](https://getquicker.net/KC/Help/Doc/mathocr)

**用途**：调用 Mathpix 识别图片中的数学公式（付费 Q 豆）。

## 示例

### 识别截图变量

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

### 识别图片 URL（表达式）

```json
{
  "stepRunnerKey": "sys:mathocr",
  "inputParams": {
    "vendor": "Mathpix",
    "image": "$$https://example.com/formula.png"
  },
  "outputParams": {
    "isSuccess": "成功",
    "latex": "Latex",
    "rawData": "原始JSON"
  }
}
```

### 手写板识别（MathpixStrokes）

```json
{
  "stepRunnerKey": "sys:mathocr",
  "inputParams": {
    "vendor": "MathpixStrokes"
  },
  "outputParams": {
    "isSuccess": "成功",
    "latex": "Latex"
  }
}
```

## 相关

basic-ocr · screenCapture · step-runner-get

# sys:translation

> **来源**：step JSON 示例 · **官方**：[translation](https://getquicker.net/KC/Help/Doc/translation)

**用途**：调用翻译服务转换文本。

## 示例

### 单条翻译

```json
{
  "stepRunnerKey": "sys:translation",
  "inputParams": {
    "operation": "single",
    "text.var": "原文",
    "srcLang": "en",
    "dstLang": "zh",
    "vendor.var": "翻译引擎"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultText": "译文",
    "costPoints": "消耗积分"
  }
}
```

### 批量翻译

```json
{
  "stepRunnerKey": "sys:translation",
  "inputParams": {
    "operation": "multiple",
    "text.var": "多行原文",
    "srcLang": "auto",
    "dstLang": "en"
  },
  "outputParams": {
    "resultText": "译文",
    "vendorResult": "引擎结果"
  }
}
```

### 英汉词典

```json
{
  "stepRunnerKey": "sys:translation",
  "inputParams": {
    "operation": "en2zh_dict",
    "text.var": "单词"
  },
  "outputParams": {
    "resultText": "释义",
    "rawData": "原始数据"
  }
}
```

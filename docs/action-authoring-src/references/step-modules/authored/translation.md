# sys:translation

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[translation](https://getquicker.net/KC/Help/Doc/translation)

**用途**：调用第三方 API 翻译文本或查英汉词典（付费 Q 豆）。

## 示例

### 单厂商翻译（英→中）

```json
{
  "stepRunnerKey": "sys:translation",
  "inputParams": {
    "operation": "single",
    "text.var": "原文",
    "srcLang": "En",
    "dstLang": "ZhCn",
    "vendor": "Youdao"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultText": "译文",
    "costPoints": "消耗"
  }
}
```

### 多厂商对比翻译

```json
{
  "stepRunnerKey": "sys:translation",
  "inputParams": {
    "operation": "multiple",
    "text": "Hello world",
    "srcLang": "En",
    "dstLang": "ZhCn",
    "vendorList": "Youdao,Baidu,Tencent"
  },
  "outputParams": {
    "isSuccess": "成功",
    "vendorResult": "各厂商结果"
  }
}
```

### 英汉词典

```json
{
  "stepRunnerKey": "sys:translation",
  "inputParams": {
    "operation": "en2zh_dict",
    "text": "example"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultText": "释义"
  }
}
```

## 相关

stringProcess · step-runner-get

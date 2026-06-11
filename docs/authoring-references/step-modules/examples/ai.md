# sys:ai

> **来源**：step JSON 示例 · **官方**：[ai](https://getquicker.net/KC/Help/Doc/ai)

**用途**：调用 OpenAI 兼容 Chat / Completions API。

## 示例

### Chat 翻译（系统提示 + 用户提示）

```json
{
  "stepRunnerKey": "sys:ai",
  "inputParams": {
    "endpoint": "chat",
    "model": "gpt-4o-mini",
    "apiKey": "{APIKey}",
    "systemPrompt": "你是专业翻译，只输出译文。",
    "prompt": "将下面文字译为英文：{原文}"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "译文",
    "totalTokens": "Token数"
  }
}
```

### Chat 多轮（会话 ID + 历史条数）

```json
{
  "stepRunnerKey": "sys:ai",
  "inputParams": {
    "endpoint": "chat",
    "model": "gpt-4o-mini",
    "apiKey": "{APIKey}",
    "prompt.var": "用户输入",
    "sessionId": "{会话ID}",
    "historyMessages": "6"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "回复",
    "historyMessages": "历史"
  }
}
```

### 流式输出到文本窗口

```json
{
  "stepRunnerKey": "sys:ai",
  "inputParams": {
    "endpoint": "chat",
    "model": "gpt-4o-mini",
    "apiKey": "{APIKey}",
    "prompt.var": "长文提示",
    "stream": true,
    "streamTo": "ai-stream"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 第三方中转（API 网址占位符）

```json
{
  "stepRunnerKey": "sys:ai",
  "inputParams": {
    "endpoint": "chat",
    "apiUrlFormat": "https://api.siliconflow.cn/v1/{1}",
    "apiKey": "{APIKey}",
    "model": "deepseek-ai/DeepSeek-V3",
    "prompt": "用三句话总结：{待摘要}"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "摘要"
  }
}
```

### Completions 补全

```json
{
  "stepRunnerKey": "sys:ai",
  "inputParams": {
    "endpoint": "completions",
    "model": "gpt-3.5-turbo-instruct",
    "apiKey": "{APIKey}",
    "prompt": "续写：从前有座山，"
  },
  "outputParams": {
    "isSuccess": "成功",
    "result": "续写结果"
  }
}
```

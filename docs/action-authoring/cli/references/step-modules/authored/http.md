# sys:http
<!-- qkrpc-search-aliases: HTTP, http请求, 请求, POST, GET -->

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[http](https://getquicker.net/KC/Help/Doc/http)

**用途**：发 HTTP 请求，取文本/图片/文件响应。

**何时读**：`get` 定 method 后；写 POST 请求体、Cookie、SSE 流式前读「模式」。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 请求头 | 多行 `Name:Value` | **勿**写 Content-Type → 用「内容类型」或请求体类型 |
| Cookie | 文本或 `$=` 词典拼接 | `Key=Value;` |
| 内容类型 | Content-Type | 仅 JSON / 二进制 / 纯文本请求体类型时 |
| 结果类型 | 文本 / 图片 / 文件 | 须与真实响应一致；文件模式输出临时路径 |
| SSE | 勾选 + 子程序名 | 子程序需 `data` 输入；通常处理 `data:` 行 |

## 模式（POST 请求体类型）

| 类型 | 请求体形状 |
|------|------------|
| JSON | 合法 JSON；1.29+ 可 `$=` 词典/匿名对象自动序列化 |
| 表单 | `a=1&b=2`（x-www-form-urlencoded） |
| Multipart | 每行 `name=value` 或 `name=FILE:路径` / `name=IMG:变量名` |
| 二进制 | `FILE:完整路径` 或 `IMG:变量名`（冒号小写） |
| 纯文本 | 原样字符串 |

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 请求头里写 Content-Type | 与请求体类型冲突 |
| 结果类型与响应不符 | 解析失败 |
| 流式 LLM 硬啃 http | 优先 `sys:ai`；其它厂商用 SSE + 子程序 |

## 示例

```json
{
  "stepRunnerKey": "sys:http",
  "inputParams": {
    "url": "https://api.example.com/items",
    "method": "POST",
    "bodyType": "JSON",
    "body": "{\"title\":\"test\"}",
    "resultType": "文本"
  },
  "outputParams": {
    "textResult": "body",
    "statusCode": "code"
  }
}
```

<!-- QuickerModuleDoc examples -->

### 获取选中文本，判断选中文本是否以“熊曰开头”，是的话HTTP请求进行解密，否则HTTP请求进行加密。最后将返回的文本发送到窗口中去

```json
{
  "stepRunnerKey": "sys:http",
  "inputParams": {
    "url": "http://hi.pcmoe.net/bear.php",
    "header": "connection:keep-alive\\nx-requested-with:XMLHttpRequest\\ndnt:1\\nx-token:07B97AA644E8\\naccept:*/*\\nreferer:http://hi.pc...",
    "bodyType": "FORM",
    "body": "$$mode=Bear&code=Decode&txt={原始文本}",
    "ua": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Mob..."
  },
  "outputParams": {
    "content": "熊曰"
  }
}
```

### 获取选中文本，判断选中文本是否以“熊曰开头”，是的话HTTP请求进行解密，否则HTTP请求进行加密。最后将返回的文本发送到窗口中去（$$mode=Bear&code=Encode&txt={原始文本}）

```json
{
  "stepRunnerKey": "sys:http",
  "inputParams": {
    "url": "http://hi.pcmoe.net/bear.php",
    "header": "connection:keep-alive\\nx-requested-with:XMLHttpRequest\\ndnt:1\\nx-token:07B97AA644E8\\naccept:*/*\\nreferer:http://hi.pc...",
    "bodyType": "FORM",
    "body": "$$mode=Bear&code=Encode&txt={原始文本}",
    "ua": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Mob..."
  },
  "outputParams": {
    "content": "熊曰"
  }
}
```
## 相关

step-runner-get · subprogram（SSE 回调）· ai · implementation-fallback

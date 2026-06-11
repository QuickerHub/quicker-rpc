# sys:ai

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[ai](https://getquicker.net/KC/Help/Doc/ai)

**用途**：调用 OpenAI 兼容 Chat/Completions API（含中转）。

**何时读**：`get` 定端点/模型后；流式、历史消息、自定义 API 网址前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 提示 | 纯文本或 JSON 消息数组 | **勿**填完整请求体；vision 用 gpt-4-vision 数组格式 |
| API网址 | `https://host/v1/{1}` 或完整 chat URL | `{1}`=接口名占位；非标准 URL 前加 `!` |
| 最大响应Token | `0` 常用 | 提示 token + 响应 ≤ 模型上限 |
| 流式输出 | + 窗口标识 | `INPUT_TEXT` 模拟输入到前台；切窗即停 |
| 会话ID | GUID | 配合「历史消息」自动持久化到 `AiLogs` |

## 模式

| 场景 | 做法 |
|------|------|
| 单次翻译/摘要 | 系统提示 + 用户提示插值 |
| 多轮对话 | GUID 会话ID + 历史条数；或自维护 JSON 数组 |
| 第三方中转 | API网址 + APIKey；第三方建议设 `stop` |

流式无法拿原始响应/token 统计；敏感数据勿外传。

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 提示里塞完整 HTTP body | 用模块字段 |
| token 超限 | 缩短提示或减历史 |

## 相关

http · step-runner-get · implementation-fallback · expressions

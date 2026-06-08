# sys:jsonExtract

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[jsonextract](https://getquicker.net/KC/Help/Doc/jsonextract)

**用途**：JsonPath / 层级路径从 JSON 或 JToken 取最多 5 项。

**何时读**：路径写法、`list:` 强制数组、根对象复用前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 输入 | JSON 文本或 JToken 对象 | |
| 提取路径1–5 | `a.b[0].c` 或 JSONPath | 先 SelectToken，失败试 SelectTokens |
| `list:` 前缀 | 强制数组提取 | 1.30.14+ |
| 根对象 | 输出 JToken | 后续步/表达式继续 `.SelectToken` |

简单字段优先 **`expressions`**：`JsonConvert.DeserializeObject` + 索引。

## 相关

expressions · http · step-runner-get · implementation-fallback

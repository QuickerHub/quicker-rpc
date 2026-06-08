# sys:translation

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[translation](https://getquicker.net/KC/Help/Doc/translation)

**用途**：调用厂商翻译 API（消耗 Q 豆，需联网）。

**何时读**：单厂商 vs 多厂商、源/目标语言 Auto 规则前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | 单厂商 / 多厂商 | 多厂商并行比选 |
| 源语言 / 目标语言 | `Auto` | 含中文→英，否则→中 |
| 待翻译文本 | inline | |

专业版有 Q 豆赠送/折扣；轻量翻译也可用 `ai` 模块。

## 相关

ai · step-runner-get · implementation-fallback

# sys:htmlExtract

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[htmlextract](https://getquicker.net/KC/Help/Doc/htmlextract)

**用途**：XPath 从 HTML/XML 或 URL 提取节点内容。

**何时读**：写 XPath、多节点列表输出、高频 URL 缓存陷阱前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 源HTML | 文本或 http(s) URL | 同 URL 短时**缓存** → 频繁更新用 `http`+提取 |
| 网页编码 | 空=UTF-8；`auto` 二次请求 | 乱码时调 |
| 节点XPath | 如 `html/head/title` | 失败试**小写**节点名 |
| 提取方式 | 首个 / 全部匹配 | 全部 → 列表输出 |
| 提取内容 | InnerHtml/InnerText/OuterHtml/属性 | 属性需「属性名称」 |

## 相关

http · jsonExtract · step-runner-get · expressions

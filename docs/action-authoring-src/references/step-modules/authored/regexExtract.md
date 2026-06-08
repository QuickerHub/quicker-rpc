# sys:regexExtract

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[regexextract](https://getquicker.net/KC/Help/Doc/regexextract)

**用途**：正则匹配提取文本或捕获组。

**何时读**：`get` 定「提取方式」后；输出是列表还是匹配1–5前读。

## 模式（提取方式 → 输出）

| 方式 | 所有匹配列表 | 匹配1–5 |
|------|--------------|---------|
| 各匹配项的值 | 全部 Match.Value | 前 5 项值 |
| 第一个匹配项的组 | 首 Match 的 Groups | 前 5 个 Group |
| 各匹配项的组 | 按组位置列表 | 列向量 |

选项：忽略大小写、单行（`.` 含 `\n`）、多行（`^`/`$` 行界）。

复杂解析优先 expressions `Regex.Match`。

## 相关

expressions · stringProcess · step-runner-get

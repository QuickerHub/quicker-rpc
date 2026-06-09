# sys:charInfo

> **分类**：文本处理 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [charinfo](https://getquicker.net/KC/Help/Doc/charinfo)

**用途**：Get character metadata (category, code point, etc.)

用于获取某个字符的Unicode编码信息/汉字的拼音信息。

[image]

# 参数

【字符】要获取信息的字符。如果输入的是多个字符，则自动获取第一个字符的信息。

## 输出

【Unicode编码（数字）】字符的Unicode编码的数值

【Unicode编码（数字）】字符的Unicode编码的十六进制字串。

【拼音首字母】汉字的拼音首字母（大写），多音字时只输出第一个。

【拼音】汉字的拼音，多音字时只输出第一个。

【拼音首字母（全部）】汉字的拼音首字母（大写），多音字时输出全部。注意：只能处理常用多音字。

【拼音（全部）】汉字的拼音，多音字时只输出全部拼音（空格分隔）。注意：只能处理常用多音字。

示例：“曾”字的信息输出：

[image]

# 更新历史

- 20230207 增加输出拼音参数（需版本1.36.28+）


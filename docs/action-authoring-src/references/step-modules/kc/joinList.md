# sys:joinList

> **分类**：文本处理 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [joinlist](https://getquicker.net/KC/Help/Doc/joinlist)

**用途**：Join list items into a single text string

使用列表里的各项拼接成一段文本。

此操作的相反操作是“[文本拆分成列表](https://www.yuque.com/quicker/help/splitstring)”。

[image: image.png]

# 参数

【输入】要合并成文本的列表变量；

【分隔文本】拼接时两项中间插入的字符；如果要合并成多行文本每个一行，分隔文本可以直接输入一个回车换行。

【转义“分隔文本”】将“分隔文本”参数中的\r、\n、\t转义处理成换行和tab字符。

## 输出

【结果】拼接成的文本。

# 示例

假设列表中各项为“AAA”“BBB”“CCC”，分隔符为“，”，则拼接的结果为：“AAA，BBB，CCC”。

# 更新历史

- 1.5.7 增加 转义“分隔文本” 参数。


# sys:everythingsearch

> **分类**：文件与目录 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [everythingsearch](https://getquicker.net/KC/Help/Doc/everythingsearch)

**用途**：Search files via Everything

【安全提示】20220908，有传说everything软件的更新服务疑似被劫持，参考： [https://www.v2ex.com/t/878475](https://www.v2ex.com/t/878475)

为安全起见，请关闭everything的自动更新服务(菜单-工具-选项-常规-启动时检查更新），如有需要，通过[https://www.voidtools.com/](https://www.voidtools.com/)手动下载版本更新。

使用本模块需要已安装和运行Everything软件1.4.1.969+或以上版本。

[image]

# 参数

【搜索内容】要搜索的文件名关键词。 支持的语法请参考：[https://www.voidtools.com/support/everything/searching/](https://www.voidtools.com/support/everything/searching/)

注：已知everything的sdk调用不支持宏（如`exe:``doc:`等），具体请以实际测试为准。作为变通，可以使用`ext:mp3;aac;...`的格式筛选文件类型。

【限定目录】搜索指定目录下的文件（包含子目录）。此参数的作用为在搜索内容前面增加路径限定，效果类似于：

[image]

注意，需要在目录路径末尾添加`\`字符，否则将匹配以此内容为开始的所有目录。

也可以将路径直接添加到【搜索内容】中（特别是当需要指定多个路径时，可以在搜索内容中使用这样的格式：`"C:\Program Files"|"D:\Work\" 关键词`）。

【扩展名】搜索指定类型的文件。使用英文半角分号分隔多种扩展名，如`doc;docx;docm`。

此参数在内部会以`ext:doc;docx;docm`的形式添加到搜索内容中（也可以直接在【搜索内容】参数中指定）。

【匹配完整文件名】完整匹配某个指定的文件名。

此参数的内部实现为在【搜索内容】前面追加`wfn:`参数，会对整个搜索内容生效。

【匹配整个单词】匹配整个单词。例如，搜索内容为“quicker.exe”时，匹配的文件名可能为“quicker.exe”、“quicker.exe.config”等。

【匹配路径】关键词匹配路径的一部分而不仅是文件名。

【匹配大小写】搜索的内容是否大小写敏感。

【使用正则匹配】是否使用正则表达式搜索文件。

【最大结果数量】最多返回的结果数量。

【排序方式】筛选结果的排序方式。某些排序方式可能会对搜索性能有一定影响，建议测试验证。

## 输出

【是否成功】是否成功执行了搜索。

【路径列表】搜索到的文件路径的列表。

【结果个数】搜索结果的数量。

【原始结果】是一个对象列表，如果有深入的需要，可以在表达式中使用这个结果。每个对象包含这些属性：

- FileName：文件名（C# String类型）
- FilePath：文件完整路径
- Modified：最后修改实际（C# DateTime类型）
- Size：文件大小（C# long类型）

# 安装Everything的注意事项

- 下载网址：https://www.voidtools.com/zh-cn/
- 根据您的电脑操作系统，选择 安装版64位，或安装版32位
- 安装时使用默认选项。确保选择“安装Everything服务”选项。

已安装好的everything软件，也可以在工具-》选项 菜单中修改相关设置。

[image]

# 更新历史

- 20240619 增加说明：限定目录参数需要以\结束。

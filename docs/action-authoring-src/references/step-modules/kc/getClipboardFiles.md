# sys:getClipboardFiles

> **分类**：剪贴板 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [getclipboardfiles](https://getquicker.net/KC/Help/Doc/getclipboardfiles)

**用途**：Get file paths from clipboard

讨论

                    相关动作

# 概述

返回剪贴板中的文件列表。内容为所有选中文件的路径。

[image: image.png]

# 参数

## 输入

【失败后中止动作】如果从剪贴板获取内容失败，则停止执行动作。

## 输出

【文件列表】从剪贴板获取的文件路径列表。

【是否成功】操作是否成功。注：如果此参数输出到变量中，则出错时不再提示提示信息。


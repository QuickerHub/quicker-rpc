# sys:getClipboardImage

> **分类**：剪贴板 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [getclipboardimage](https://getquicker.net/KC/Help/Doc/getclipboardimage)

**用途**：Read image from clipboard

# 概述

读取剪贴板图片并保存到变量中。

一般用于获取截图内容等情况。

[image: image.png]

# 参数

## 输入

【失败后中止动作】如果从剪贴板获取内容失败，则停止执行动作。

## 输出

【结果图片】从剪贴板获取的图片对象。

【是否成功】操作是否成功。注：如果此参数输出到变量中，则出错时不再提示提示信息。

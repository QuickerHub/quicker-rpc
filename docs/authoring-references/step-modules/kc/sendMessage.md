# sys:sendMessage

> **分类**：系统与窗口 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [sendmessage](https://getquicker.net/KC/Help/Doc/sendmessage)

**用途**：Send Win32 SendMessage to a window

讨论

                    相关动作

# 概述

【0.11.4版本之后开始提供】

调用[SendMessage](https://docs.microsoft.com/en-us/windows/desktop/api/winuser/nf-winuser-sendmessage)向指定的窗口发送Windows消息。您需要了解Win32编程知识才能使用本模块。 另外本模块限制了只能发送数字类型到lParam参数中，因此不是所有的消息类型都可以调用。

# 参数

[image: image.png]

【窗口句柄hWnd】要发送消息到的目标窗口。接收整数类型的参数。

【消息】要发送的消息，十进制数字值（如：1234），或十六进制值，如：0x0112。具体请查询Win32文档。

【wParam】wParam参数，十进制数字值（如：1234），或十六进制值，如：0x0112。具体可用值请参考消息文档。

【lParam】lParam参数，十进制数字值（如：1234），或十六进制值，如：0x0112。具体可用值请参考消息文档。

# 示例

- https://getquicker.net/sharedaction?code=ef1a10ef-bbb2-4dcf-5f17-08d6cebc3090

# 参考文档

- SendMessage文档
- WM_SYSCOMMAND消息文档


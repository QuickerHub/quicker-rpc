# sys:fileToClipboard

> **分类**：剪贴板 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [filetoclipboard](https://getquicker.net/KC/Help/Doc/filetoclipboard)

**用途**：Put files onto clipboard

讨论

                    相关动作

# 概述

将指定的一个或多个文件存入剪贴板，方便在其他软件中粘贴（如粘贴在聊天窗口里）。

[image: image.png]

# 参数

根据需求，【单个文件】和【文件列表】两个参数选择一个使用。

单个文件时，使用【单个文件】参数，输入此文件的完整路径。

文件数量不定或多个文件时（这时候也可能列表里只有一个文件），使用【文件列表】参数传入多个文件的路径列表。

请确保文件都是存在的并且可以正常读取（没有被其他软件锁定）。


# sys:autocadcontrol

> **分类**：第三方软件 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [autocadcontrol](https://getquicker.net/KC/Help/Doc/autocadcontrol)

**用途**：Send commands to AutoCAD

# 概述

向AutoCAD软件发送命令或脚本。

[image]

【操作类型】

可选的操作类型，目前仅支持“执行命令”。

【命令内容】

AutoCAD命令或AutoLisp脚本。请确保脚本内容的合法性。

通常在命令末尾增加空格或回车表示开始执行命令。如果有多余的空格或回车，可能会多次执行命令。

**示例动作**

- ZoomAll：运行_zoom all 命令。
- LispHelloWorld：使用AutoLisp显示Hello World消息。

**参考文档**

- AutoLisp入门实例教程（上）
- AutoLisp入门实例教程（下）

# 通过手势、轮盘等执行命令或脚本

因为轮盘等快速触发不能直接向CAD发送命令，需要通过一个单独的动作来中转。实现步骤如下：

（1）先在合适的位置安装此动作：[参数传递CAD命令](https://getquicker.net/Sharedaction?code=3dfd19f5-7e33-4864-5286-08da4e691004)

（2）在轮盘、手势等位置，使用下面的设定方式调用动作，并将要执行的命令作为参数传递给动作。

[image]

设置方法：1、操作类型选择“运行Quicker动作”。2、输入动作名称“参数传递CAD命令”。3、动作参数中输入要执行的命令。 注意末尾加空格开始执行。

# 更新历史

- 20250120 更新文档标题，以匹配实际功能。

# sys:autocadcontrol

> **分类**：第三方软件 · **官方**：[autocadcontrol](https://getquicker.net/KC/Help/Doc/autocadcontrol)

**用途**：Send commands to AutoCAD

## 要点（摘自官方文档）

# 概述

向AutoCAD软件发送命令或脚本。

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

## 相关

`step-modules` · `step-runner-get` · `implementation-fallback`

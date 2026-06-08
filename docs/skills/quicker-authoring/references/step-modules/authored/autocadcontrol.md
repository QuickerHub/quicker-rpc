# sys:autocadcontrol

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[autocadcontrol](https://getquicker.net/KC/Help/Doc/autocadcontrol)

**用途**：向前台 AutoCAD 发送命令或 AutoLisp。

**何时读**：命令末尾空格/回车表「执行」前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | 目前「执行命令」 | |
| 命令内容 | 命令或 Lisp | 末尾空格/回车触发；多余回车可能重复执行 |

AutoCAD 须已运行且为活动上下文。

## 相关

rhinocontrol · step-runner-get

# sys:waitClipboardChange

> **分类**：常用基础 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [waitclipboardchange](https://getquicker.net/KC/Help/Doc/waitclipboardchange)

**用途**：Wait until clipboard content changes

# 概述

通常用于等待第三方工具（如截图软件）完成操作并将内容写入剪贴板。

[image]

使用截图软件的通常操作步骤为：

1. 发送快捷键或运行截图软件启动截图
2. 等待剪贴板内容变化
3. 获取剪贴板图片

【注】Quicker 0.10.1 之后的版本已内置[屏幕](https://www.yuque.com/quicker/help/screencapture)[截图](https://www.yuque.com/quicker/help/screencapture)[模块](https://www.yuque.com/quicker/help/screencapture)。

## 输入参数

**最长等待时间**：持续检测剪贴板变化，直到达到超时时间。

**等待窗口关闭时取消**：结合“[等待窗口](https://www.yuque.com/quicker/help/showwaitwin)”模块从而实现提前取消等待的功能。

**失败后中止动作**：如果达到超时时间后剪贴板仍然没有变化，是否停止后续动作的执行。

## 输出

**是否改变**：剪贴板是否变化。

# 注意事项

- 等待剪贴板改变后尽量不要立即使用模拟按键功能。
  这时Ctrl和C键仍未抬起，模拟按键可能导致Ctrl和C处于按下状态无法抬起。 如需使用模拟按键，可以尝试在模拟按键消息之前增加100-200ms的延迟。

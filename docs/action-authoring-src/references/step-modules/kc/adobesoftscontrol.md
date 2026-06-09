# sys:adobesoftscontrol

> **分类**：第三方软件 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [adobesoftscontrol](https://getquicker.net/KC/Help/Doc/adobesoftscontrol)

**用途**：Control Adobe apps (JS script, etc.)

# 概要

用于对Photoshop、Illustrator、AE等软件运行jsx脚本。

需要启动软件后才能使用。

[image]

注意：如果同时安装了多个版本的软件，只能控制其中一个版本。在其它版本上使用会报错 `操作无法使用 (异常来自 HRESULT:0x800401E3 (MK_E_UNAVAILABLE))`。

【软件名称】选择要执行脚本的软件。

【操作类型】

- 执行js脚本：参数中指定要运行的脚本内容。
- 执行js脚本文件：参数中指定jsx文件的路径。

【脚本内容】

- jsx脚本内容。

【等待执行结束】

是否等待脚本执行结束后再进行后续步骤。

【接口失败后，尝试使用程序exe运行脚本文件】

当系统环境不支持使用接口运行脚本时，尝试使用`photoshop.exe -r path.jsx`的方式执行脚本。这种情况下无法获知脚本是否执行成功，无法等待脚本执行完成。

【脚本输出】

从脚本中返回的内容。

- 仅在通过接口、等待执行结束的方式执行脚本时可返回内容。
- 仅支持PS、Illustrator。
- 仅支持简单类型的内容，不支持返回object。

[image]

**示例动作**

- 右转90度：画布向右旋转90度
- 批量生成不同尺寸图标

**参考文档**

- Photoshop 脚本教程

# 问题排查

## 1. 0x800401E1 (MK_E_UNAVAILABLE)

[image]

1）确认您安装的PS是完整版而非绿色版。

2）确认系统UAC设置为默认，如果修改过，改为默认后重启Windows。

[image]

# psjs脚本的执行

目前PS尚未提供执行psjs代码的接口。可以通过如下方式执行psjs脚本：

[image]

# 更新历史

- 20230914 增加返回内容的功能。
- 20230923 1.39.33 支持同时安装多个Photoshop、 AI 的情况。


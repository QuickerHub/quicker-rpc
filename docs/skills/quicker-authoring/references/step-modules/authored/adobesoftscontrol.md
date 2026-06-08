# sys:adobesoftscontrol

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[adobesoftscontrol](https://getquicker.net/KC/Help/Doc/adobesoftscontrol)

**用途**：对 PS / Illustrator / AE 等执行 JSX。

**何时读**：内联脚本 vs jsx 文件、等待结束与返回值前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 软件名称 | PS / AI / AE… | 须先启动；多版本共存可能 `MK_E_UNAVAILABLE` |
| 操作 | 执行脚本 / 执行脚本文件 | |
| 等待执行结束 | 开才可拿「脚本输出」 | 仅 PS/AI 简单类型返回值 |
| 接口失败回退 | `photoshop.exe -r path.jsx` | 无法知成功/等待 |

UAC 非默认可能导致 COM 失败。

## 相关

runScript · step-runner-get · action-project-files

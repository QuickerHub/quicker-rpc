# sys:uiautomation

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation)

**用途**：通过 UIAutomation 定位并操作 Win32 控件（名称 + 类型）。

**何时读**：`get` 定操作后；与 **flauiautomation**（XPath）选型时读对比。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 窗口/控件定位 | 见 get 各操作 | 名称 + 控件类型；inspect.exe 查「名称」 |
| 步骤间 | 加 `delay` | 界面未就绪会失败 |

## 模式（与 FlaUI）

| 模块 | 定位 | 适用 |
|------|------|------|
| `sys:uiautomation` | 名称 + 类型 | 简单界面；同名控件不支持 |
| `sys:flauiautomation` | XPath | 复杂树；见 `flauiautomation` ref |

兼容性因应用而异；多步操作间须等待。

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 无 delay 连点 | 控件未出现 |
| 多个同名控件 | 本模块无法消歧 |

## 相关

flauiautomation · step-runner-get · inputScript · implementation-fallback

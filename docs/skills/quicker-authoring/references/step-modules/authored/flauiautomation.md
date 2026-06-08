# sys:flauiautomation

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[uiautomation](https://getquicker.net/KC/Help/Doc/uiautomation)

**用途**：FlaUI + **XPath** 定位 UI 控件（对比 `uiautomation` 名称+类型）。

**何时读**：复杂控件树、需 XPath 消歧时选本模块。

## wire 要点

| 对比 | `uiautomation` | `flauiautomation` |
|------|----------------|-------------------|
| 定位 | 名称 + 类型 | **XPath** |
| 同名控件 | 不支持 | XPath 可区分 |

步骤间加 `delay`；兼容性因应用而异。inspect.exe 辅助查属性。

## 相关

uiautomation · step-runner-get · inputScript

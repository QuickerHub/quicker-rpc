# sys:customwindow

> **分类**：界面交互 · **来源**：仓库手写 · **官方**：[customwindow](https://getquicker.net/KC/Help/Doc/customwindow)

**用途**：用 XAML 建自定义 WPF 窗口（数据绑定、qk 扩展）。

**何时读**：必须 WPF 且 `form`/`webview2` 不够时；**难度高**，优先其它 UI 方案。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | 显示/等待关闭/关闭 | `窗口标识` 关指定窗 |
| 窗口XAML代码 | inline / `.file` | 去掉 `x:Class`；无事件处理方法属性 |
| 窗口标识 | 字符串 | 关闭、复用窗口 |
| 数据上下文 | 变量/词典绑定 | `xmlns:qk="https://getquicker.net"` |

## 协议（XAML 约束）

- 事件用 qk 行为/命令，非 code-behind
- 子程序调用：`qk:InvokeSubprogram` 等（见官方 XAML 示例）
- VS 调试后迁入 Quicker；长 XAML → `.file`

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 复杂业务全堆 XAML | 用 `form` / `webview2` / `custompanel` |
| 保留 x:Class | 加载失败 |

## 相关

custompanel · form · webview2 · subprogram · step-runner-get

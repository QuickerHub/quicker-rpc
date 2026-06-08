# sys:webview2

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[webview2](https://getquicker.net/KC/Help/Doc/webview2)

**用途**：内嵌 WebView2 窗口（自定义 HTML 工具页、仪表盘等）。

**何时读**：自定义页 P4–P6；详表见 **webview2-authoring**，此处仅 wire 陷阱。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| type | `controlField` | OpenUrl / SendMessage / ExecuteScript / 等待关闭等 |
| url | inline / `url.file` | 长 HTML → `files/page.html` |
| 窗口标识 | `=` = 当前动作 ID | 避免重复开窗 |
| virtualHostToFolder | `host\|folder` | 本地资源映射为 `https://host/…` |
| script | inline / `script.file` | 文档创建后注入 JS |
| Profile | 单词标识 | 多账号隔离 cookie |

需已安装 WebView2 Runtime（Win11 通常自带）。

## 模式（操作类型）

| type | 行为 |
|------|------|
| 打开网址 | 继续后续步骤；同标识复用窗口 |
| 打开并加载完成 / 等待关闭 | 同步点 |
| 发送消息 / 执行脚本 | 需 `窗口标识` + 页内 `chrome.webview` 监听 |
| 多标签/多列 | 仅布局；`网址列表` 每行 `标题\|url` 或 `标题(Profile)\|url` |

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| csscript 拼整页 HTML 弹窗 | 用 webview2 + files |
| 随意设附加浏览器参数 | 可能无法多开 |
| 改变量名不更新 JS | 脚本仍用旧 Quicker 变量名 |

## 相关

webview2-authoring · action-project-files · step-runner-get · form

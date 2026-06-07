# {{#topic-title}}

**何时读**：动作用 **`sys:webview2`** 展示自定义 HTML 界面（仪表盘、小工具、游戏页等）。P4 选型后、写步骤与 `files/` 页面前。**模块参数细节**仍须 **`step-runner-get`**（`controlField: OpenUrl`）；KC 补充见 **`docs_get_reference(step-modules, webview2)`**。

## P4 选型

| 需求 | 选型 |
|------|------|
| 自定义 HTML/CSS/JS 界面 | **`sys:webview2`**（本 topic） |
| Quicker 原生多字段表单 | **`sys:form`** + **`form-spec`** |
| 简单弹窗/确认 | `sys:MsgBox` 等 + **`expressions`** |
| 仅打开外部网址 | `sys:webview2` `OpenUrl` + HTTP(S) URL，或公共子程序「打开网址」 |

**勿**用 `sys:csscript` 拼整页 HTML 再弹窗；长页面正文放 **`files/`**，步骤只引用路径。

## P5 schema

```text
qkrpc_step_runner_search({ query: "webview2" })
qkrpc_step_runner_get({ key: "sys:webview2", controlField: "OpenUrl" })
```

常用 **`inputParams`**（键名以 get 为准）：

| 键 | 典型值 | 说明 |
|----|--------|------|
| `type` | `OpenUrl` | 打开网页（继续执行后续步骤） |
| `url` | `{ "file": "files/page.html" }` 或 `{ "value": "https://…" }` | **HTML 正文或 URL**；长 HTML **默认 `file` 外置** |
| `title` | `{ "value": "窗口标题" }` | 可选 |
| `winSize` | `{ "value": "800,600" }` | 宽,高（像素或 `%`） |
| `winLocation` | `{ "value": "CenterScreen" }` | 见 get 的 `winLocation` 枚举 |
| `virtualHostToFolder` | `{ "value": "myserver\|files/assets" }` | 本地目录映射为 `https://myserver/…`（多文件资源） |
| `autoCloseKey` | `{ "value": "=" }` | `=` = 当前动作 ID，避免重复开窗 |
| `script` | `{ "file": "files/inject.js" }` | 可选：文档创建时注入的 JS |

其它操作类型（`SendMessage`、`ExecuteScript`、等待关闭等）须对 **`type`** 再 get 对应 control。

## P6 磁盘布局

**默认形状**（与 **`action-project-files`**、**`action-steps`** 长参数外置一致）：

```json
{
  "stepRunnerKey": "sys:webview2",
  "inputParams": {
    "type": { "value": "OpenUrl" },
    "url": { "file": "files/page.html" },
    "title": { "value": "我的工具" },
    "winSize": { "value": "960,640" }
  }
}
```

| 规则 | 说明 |
|------|------|
| HTML **超过 4 行** | 正文在 **`files/*.html`**（或 `.htm`），`url` 写 `{ "file": "…" }`，**勿**内联进 `data.json` |
| 单文件页面 | 一个 `.html` 内联 CSS/JS 即可 |
| 多文件资源 | 资源放 `files/assets/` 等，步骤设 **`virtualHostToFolder`**，HTML 里用 `https://myserver/assets/…` |
| 与变量交互 | 页面 JS 用 **`$quicker` / `$quickerSync`** 读写变量；见 reference **`webview2`** |

`url` 的 `value` 也可直接写 **整段 HTML 字符串**（仅极短占位页）；保存进 Quicker 前 workspace 仍优先 **`file`**。

{{#only-agent}}
## 右侧浏览器预览（patch 前）

用 **`browser`** 在 **右侧浏览器面板** 快速查看 HTML 布局与交互（工具执行后面板自动打开并同步预览截图）。**预览不能替代** Quicker 内 WebView2 桥接（`$quicker`）的最终验证。

### 流程

```text
1. workspace_program file_write / file_edit → files/page.html
2. workspace_program file_read → 取 HTML 正文（或已知绝对路径）
3. browser navigate → 右侧面板预览
4. 改 HTML → browser reload 或再次 navigate
5. （可选）browser snapshot → click / type 验证交互
6. 满意后 workspace_program patch
7. 需要 $quicker / PostMessage 时 → qkrpc_action debug 在 Quicker 内测
```

### navigate URL 选型

| 场景 | `browser({ action: "navigate", url })` |
|------|----------------------------------------|
| 单文件 HTML，无外部资源 | `data:text/html;charset=utf-8,` + `encodeURIComponent(html)` |
| 含 `files/` 相对资源（CSS/图片/模块） | `file:///` + 绝对路径（`\` → `/`），指向 **HTML 文件** 本身 |
| 已部署的 HTTP(S) 页 | 直接 URL |

**注意**：

- `data:` URL 编码后过长（约 >100KB）时改用 **`file://`** 或 **`virtualHostToFolder`** + 本地目录。
- 预览为 Chromium（Playwright），与 Quicker WebView2 **渲染接近**；字体、DPI、`$quicker` 仍以 **`debug`** 为准。
- 标题栏可手动切到 **「页面」** 视图查看内嵌浏览器；Agent 用 **`browser`** 即可驱动同一预览链路。

### 示例

```text
# 读盘后 data: 预览（短页）
workspace_program({ action: "file_read", target: "action", id: "<actionId>", path: "files/page.html" })
browser({ action: "navigate", url: "data:text/html;charset=utf-8," + encodeURIComponent("<html>…</html>") })

# 含 assets 子目录时 file: 预览（cwd 下绝对路径）
browser({ action: "navigate", url: "file:///D:/workspace/.quicker/actions/<actionId>/files/page.html" })
```

改完 **`files/page.html`** 后：**先 preview → 再 patch**，减少在 Quicker 里反复运行动作。
{{/only-agent}}

## 运行时与 Quicker 交互（摘要）

| 能力 | 页面侧 |
|------|--------|
| 读/写动作变量 | `await $quicker.getVar("key")` / `setVar` |
| 词典变量 | `setDictByJson` / `getDictItemValue`（见 reference） |
| 调用动作内子程序 | `await $quickerSp("子程序名", { input: "…" })` |
| Quicker → 页面 | 步骤 `SendMessage` + `window.chrome.webview.addEventListener('message', …)` |

完整 API 与多标签/多列布局：**`docs_get_reference(step-modules, webview2)`**。

## 相关

`authoring-workflow` · `action-steps` · `action-project-files` · `step-runner-get` · `step-modules` · `form-spec`

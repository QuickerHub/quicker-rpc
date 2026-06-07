# {{#topic-title}}

**何时读**：**`overview`** P4–P5 — 定好 `key` 后。**默认只调 `qkrpc_step_runner_get`**（字段 `purpose`、`controlField.selection` 已含模块说明）；仅复杂模块再读 reference。

## 信息源（分工）

| 层级 | 来源 | 内容 |
|------|------|------|
| 1 选型 | **`implementation-fallback`** · **`expressions`** | 表达式优先；专用模块 vs csscript |
| 2 发现 | **`step-runner-search`** · **`_catalog`** | `key`、`controlField`、snippet |
| 3 **默认** | **`qkrpc_step_runner_get`** | 参数/输出 **键名、类型、purpose**（权威，足够写大多数步骤） |
| 4 可选 | **`docs_get_reference(step-modules, file)`** | 仅 **KC 协议/跨字段** 补充（见 `_catalog`「有 reference」表） |

**禁止**：未 `get` 就猜键名；对「仅 get」模块去读不存在的 reference。

## 哪些模块有 reference？

约 **40** 个复杂模块单独生成 `references/step-modules/<id>.md`（HTTP 体格式、UI 自动化、Excel、脚本等）。其余 **~100** 个模块 **不生成** reference——与 `step-runner get` 重复。

维护：`npm run docs:modules:gen`（更新 `step-module-skip.json` + reference 文件）。清单：**`_catalog`**。

## 读取方式

{{#only-agent}}
```text
qkrpc_step_runner_get({ key: "sys:http", controlField: "GET" })   # 默认路径
docs_get_reference({ topic: "step-modules", file: "_catalog" })     # 有无 reference
docs_get_reference({ topic: "step-modules", file: "http" })       # 仅有 reference 的模块
```
{{/only-agent}}
{{#only-cli}}
```powershell
qkrpc step-runner get --key sys:http --control-field GET --json
qkrpc guide get --topic step-modules --json
```
{{/only-cli}}

## 分类速查

{{#include-reference _catalog}}

## 建议优先读 reference 的模块

| 场景 | key | ref id |
|------|-----|--------|
| HTTP / API / SSE | `sys:http` | `http` |
| 文件多操作 | `sys:fileOperation` | `fileOperation` |
| 文本多模式 | `sys:stringProcess` | `stringProcess` |
| 子程序 | `sys:subprogram` | `subprogram` |
| 复杂 C# / 脚本 | `sys:csscript` | `csscript` |
| UI 自动化 | `sys:uiautomation` | `uiautomation` |
| 浏览器 | `sys:chromecontrol` | `chromecontrol` |
| 多字段表单 | `sys:form` | `form` |
| WebView2 自定义页 | `sys:webview2` | `webview2` |
| AI 调用 | `sys:ai` | `ai` |

表达式/LINQ/剪贴板/弹窗等：**`expressions`** + **`get`** 即可，无 reference。

## 相关

`step-runner-search` · `step-runner-get` · `implementation-fallback` · `expressions` · `authoring-workflow`

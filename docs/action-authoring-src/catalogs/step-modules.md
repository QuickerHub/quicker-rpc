# {{#topic-title}}

**何时读**：**`overview`** P4–P5 — 定好 `key` 后。**默认只调 `qkrpc_step_runner_get`**（字段 `purpose`、`controlField.selection` 已含模块说明）；仅复杂模块再读 reference。

## 信息源（分工）

| 层级 | 来源 | 内容 |
|------|------|------|
| 1 选型 | **`implementation-fallback`** · **`expressions`** | 表达式优先；专用模块 vs csscript |
| 2 发现 | **`step-runner-search`** · **`_catalog`** | `key`、`controlField`、snippet |
| 3 **默认** | **`qkrpc_step_runner_get`** | 参数/输出 **键名、类型、purpose**（权威，足够写大多数步骤） |
| 4 可选 | **`docs_get_reference(step-modules, file)`** | 复杂模块补充（见 `_catalog`）；分 **手写** / **KC 爬取** 两类 |

**禁止**：未 `get` 就猜键名；对「仅 get」模块去读不存在的 reference。

## 哪些模块有 reference？

| 类型 | 路径 | 维护 |
|------|------|------|
| **手写** | `references/step-modules/authored/<id>.md` | 仓库直接编辑；规范见 **`authored/SPEC.md`** |
| **KC 全文** | `references/step-modules/kc/<id>.md` | `npm run docs:modules:crawl` 爬取；官方全文，供搜索检索 `kc/<id>` |

约 **44** 个模块有手写 reference；**全部**模块均有 KC 全文（见 **`_catalog`**）；其余无 ref 文件模块 `step-runner get` 已够。

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
| 多步骤输入 DSL | `sys:inputScript` | `inputScript` |
| HTTP / API / SSE | `sys:http` | `http` |
| 文件多操作 | `sys:fileOperation` | `fileOperation` |
| 文本多模式 | `sys:stringProcess` | `stringProcess` |
| 子程序 | `sys:subprogram` | `subprogram` |
| 复杂 C# / 脚本 | `sys:csscript` | `csscript` |
| UI 自动化 | `sys:uiautomation` | `uiautomation` |
| 浏览器 | `sys:chromecontrol` | `chromecontrol` |
| 多字段表单 | `sys:form` | **`form-spec`**（步骤示例见 `form` ref） |
| WebView2 自定义页 | `sys:webview2` | `webview2` |
| AI 调用 | `sys:ai` | `ai` |

全部有 reference 的模块均在 **`authored/`**（无 KC 爬取并存）。

表达式/LINQ/剪贴板/弹窗等：**`expressions`** + **`get`** 即可，无 reference。

## 相关

`step-runner-search` · `step-runner-get` · `implementation-fallback` · `expressions` · `authoring-workflow`

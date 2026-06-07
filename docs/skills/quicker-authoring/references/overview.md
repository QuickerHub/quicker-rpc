# 总览

无头编辑 XAction：**agent-ui 工具** + QuickerRpc 插件。流程专题见 **`docs_index`**；参数/字段以各工具 description 为准，勿在回复中粘贴指南全文。

## 文档怎么用

| 层级 | 内容 |
|------|------|
| **工具 description** | 参数名、返回值、字段约束（权威来源） |
| **流程文档** | P0–P7 顺序、工具与工作区分工（`authoring-workflow`、`workspace-editing` 等） |
| **动作文件定义** | `action-variables`、`action-steps`、`expressions`、`action-project-files` — 仅 `data.json` / 目录结构 |
| **CLI 专用** | `patch-workflow`（内联 patch JSON） |

**Agent 默认路径**：**`qkrpc_action_manage create`** / **`qkrpc_subprogram_manage create`**（仅 `info.json`+空 `data.json`）或 **`qkrpc_action_get`** / **`qkrpc_subprogram get`**（非空才 extract）→ **`workspace_program`** 改 `data.json` / `files/` → **`workspace_program patch`**。新建后**勿**再 get；**勿**内联 patch JSON / **`--patch-file`**。

## P0 前置

Quicker 运行中且已加载 QuickerRpc 插件。agent-gui 优先 **`qkrpc serve`**（`http://127.0.0.1:9477`），未启动时回退 CLI 子进程。指南用 **`docs_get` / `docs_search` / `docs_index`** 本地 skill，不经 `qkrpc guide`。

按需 `docs_get` 读专题（**勿**在会话开头连续多篇全文）：

| 工具 | 用途 |
|------|------|
| `docs_index` | 主题列表（含 `layer` 分组） |
| `docs_get` | 如 `authoring-workflow`、`workspace-editing`、`action-steps` |
| `docs_search` | 关键词检索 |

## 编辑链路（P0–P7）

```text
阶段  目的
────  ─────────────────────────────────────────
 P0   Quicker + 插件（见「P0 前置」）；侧边栏工作目录
 P1   定位 actionId（create / list / search）
 P2   读取并同步工作区（get → .quicker/actions/{actionId}/）
 P3   元数据（可选：set-metadata）
 P4   实现选型（**表达式优先** → 专用步骤 → csscript）
 P5   每步：step-runner get（禁止猜 inputParams 键名）
 P6   编辑 data.json / files/ → 保存到 Quicker
 P7   保存后以 editVersion 为准（勿反复 get 确认）
```

**逐步操作**：**`authoring-workflow`**。**工作区工具与目录**：**`workspace-editing`**。

## 专题索引

### 工作流

| 标题 | topic | 何时读 |
|------|-------|--------|
| 写动作流程 | **`authoring-workflow`** | 按 P1–P7 执行（主流程） |
| 工作区编辑 | **`workspace-editing`** | `.quicker` 布局、workspace 工具、file 外置、禁止项 |
| 子程序 | **`subprogram-workflow`** | 公共子程序 vs 动作内子程序 |
| 动作整理 | **`action-organization-workflow`** | 整理动作页：移动、全局 tab、虚拟进程归集（不改程序体） |

### 数据形状与规则

| 标题 | topic | 何时读 |
|------|-------|--------|
| 动作步骤 | **`action-steps`** | P5–P6：`steps[]` 形状、`inputParams` / `outputParams`、条件分支 |
| 动作变量 | **`action-variables`** | `variables[]` 类型、`quicker_in_param` 边界 |
| 表达式与插值 | **`expressions`** | P4 **首选**：`$=`、`$$`、`sys:evalexpression` |
| 实现选型与回退 | **`implementation-fallback`** | P4：表达式不够或无模块时的回退 |
| 动作图标 | **`action-icons`** | P3：元数据 / 菜单项 `fa:` spec；须 `fa search` |
| 操作项文本语法 | **`common-operation-item`** | P3：右键菜单 `ContextMenuData` |
| 工作区目录与外置 | **`action-project-files`** | `.quicker/actions` 布局、`file` 引用形状 |
| 多字段表单 | **`form-spec`** | `sys:form` + `files/*.form.json` |
| WebView2 页面 | **`webview2-authoring`** | `sys:webview2` + `files/*.html`；Agent 侧 **`browser`** 右栏预览 |
| 动作内子程序 | **`action-embedded-subprograms`** | `subprograms/{subId}/` 磁盘模型 |

### 步骤模块与 CLI

| 标题 | topic | 何时读 |
|------|-------|--------|
| 步骤模块搜索 | **`step-runner-search`** | P5：目录搜索 OR/通配 |
| 步骤模块 schema | **`step-runner-get`** | P5：Agent 只用 `get`（禁止 `get-ui`） |
| 步骤模块用法 | **`step-modules`** | P4–P5：模块目录；复杂模块才 `docs_get_reference` |

| 标题 | topic | 何时读 |
|------|-------|--------|
| 打开 Quicker 界面 | **`quicker-ui`** | 打开设置页/回收站/搜索框等（非编辑程序体） |

## 常见错误（由工具返回的 `errorMessage` / stderr）

| 场景 | 对策 |
|------|------|
| `value` / 内联 `defaultValue` 含 `{var}` 却未以 `$$`/`$=` 开头 | 运行时不会展开；改为 `$$…` / `$=…` 或 `varKey`（**`expressions`**） |
| 猜 `inputParams` 键名 | 键名须与 step-runner schema 一致（**`step-runner-get`**） |
| 长脚本/字符串塞进 `value` | 超过约 4 行用 **`files/`** + `{ "file": "files/…" }`（**`action-steps`**、**`action-project-files`**） |
| `outputParams` 误用 input 形状 `{ "varKey": "…" }` | 应写 `"outputKey": "clipText"` 等 **字符串**（可 `dictVar.key`），见 **`action-steps`** |
| 使用废弃的 `defaultValueFile` | 改为 `defaultValue: { "file": "files/…" }`（**`action-variables`**） |
| 猜 `callIdentifier`、图标 spec | 须从子程序定义 / 图标目录取得，勿手写（**`subprogram-workflow`**、**`action-icons`**） |
| 保存后反复 get 确认 | 以 patch / 编辑响应中的 **`editVersion`** 为准（**`authoring-workflow`** P7） |
| 传内联 patch JSON / `--patch-file` | Agent 用 **`workspace_program edit_data`** 改磁盘 **`data.json`** 后 **`workspace_program patch`**（**`workspace-editing`**） |

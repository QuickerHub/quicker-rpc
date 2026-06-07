# {{#topic-title}}

{{#ref product.intro}}

## 文档怎么用

{{#include-partial doc-layers-table}}

{{#only-agent}}
**Agent 默认路径**：**`qkrpc_action_manage create`** / **`qkrpc_subprogram_manage create`**（仅 `info.json`+空 `data.json`）或 **`qkrpc_action_get`** / **`qkrpc_subprogram get`**（非空才 extract）→ **`workspace_program`** 改 `data.json` / `files/` → **`workspace_program patch`**。新建后**勿**再 get；**勿**内联 patch JSON / **`--patch-file`**。
{{/only-agent}}
{{#only-cli}}
**CLI 默认路径**：`action get` → `step-runner get` → `action patch --patch-file`（或 extract/apply 改磁盘）。
{{/only-cli}}

## P0 前置

{{#ref overview.p0}}

{{#only-agent}}
按需 `docs_get` 读专题（**勿**在会话开头连续多篇全文）：

| 工具 | 用途 |
|------|------|
| `docs_index` | 主题列表（含 `layer` 分组） |
| `docs_get` | 如 `authoring-workflow`、`workspace-editing`、`action-steps` |
| `docs_search` | 关键词检索 |
{{/only-agent}}

{{#only-cli}}
```powershell
{{@ help}}
{{@doc authoring-workflow}}
```
{{/only-cli}}

## 编辑链路（P0–P7）

{{#include-partial pipeline-p0-p7}}

**逐步操作**：**`authoring-workflow`**。{{#only-agent}}**工作区工具与目录**：**`workspace-editing`**。{{/only-agent}}

## 专题索引

### 工作流

{{#include-partial topic-index-workflows}}

### 数据形状与规则

{{#include-partial topic-index-schemas}}

### 步骤模块与 CLI

{{#include-partial topic-index-catalogs}}

| 标题 | topic | 何时读 |
|------|-------|--------|
| 打开 Quicker 界面 | **`quicker-ui`** | 打开设置页/回收站/搜索框等（非编辑程序体） |

## 常见错误（{{#ref errors.source}}）

{{#include-partial errors-table}}

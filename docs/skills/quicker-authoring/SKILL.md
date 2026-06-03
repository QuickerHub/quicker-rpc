---
name: quicker-authoring
description: "Quicker 动作无头编辑总览：P0 环境、docs 工具、P0–P7 索引。Use when starting action editing or choosing which guide topic to read next."
allowed-tools: docs_get docs_search docs_index
compatibility: "QuickerAgent (agent-ui); requires Quicker + QuickerRpc plugin"
---

# Overview（动作编辑入口）

无头编辑 XAction：**agent-ui 工具** + QuickerRpc 插件。流程专题见 **`docs_index`**；参数/字段以各工具 description 为准，勿在回复中粘贴指南全文。

## 文档怎么用

| 层级 | 内容 |
|------|------|
| **工具 description** | 参数名、返回值、字段约束（权威来源） |
| **流程文档（本目录）** | P0–P7 顺序、workspace 分工、表达式/变量等领域规则 |
| **CLI 专用** | `patch-workflow`、`action-project-files`（内联 JSON / extract·apply） |

**Agent 默认路径**：**`qkrpc_action_create`**（仅 `info.json`）或 **`qkrpc_action_get`**（非空才 extract）→ **`workspace_*`** 改 `data.json` → **`qkrpc_action_patch({ id })`**。新建后**勿**再 get；勿传内联 patch JSON。

## P0 前置

Quicker 运行中且已加载 QuickerRpc 插件。agent-gui 优先 **`qkrpc serve`**（`http://127.0.0.1:9477`），未启动时回退 CLI 子进程。指南用 **`docs_get` / `docs_search` / `docs_index`** 本地 skill，不经 `qkrpc guide`。

按需 `docs_get` 读专题（系统提示已含核心规则，**勿**在会话开头连续多篇全文）：

| 工具 | 用途 |
|------|------|
| `docs_index` | 主题列表 |
| `docs_get` | 如 `authoring-workflow`、`workspace-editing`、`action-steps` |
| `docs_search` | 关键词检索 |

## 编辑链路（P0–P7）

```text
阶段  目的
────  ─────────────────────────────────────────
 P0   Quicker + 插件（见上文「P0 前置」）；侧边栏工作目录
 P1   定位 actionId（create / list / search）
 P2   读取并同步工作区（get → .quicker/actions/{actionId}/）
 P3   元数据（可选：set-metadata）
 P4   实现选型（**表达式优先** → 专用步骤 → csscript）
 P5   每步：step-runner get（禁止猜 inputParams 键名）
 P6   编辑 data.json / files/ → 保存到 Quicker
 P7   保存后以 editVersion 为准（勿反复 get 确认）
```

**逐步操作**：**`authoring-workflow`**。**工作区工具与目录**：**`workspace-editing`**。

## 专题索引（按阶段）

| 主题 | 何时读 |
|------|--------|
| **`authoring-workflow`** | 按 P1–P7 执行（主流程） |
| **`action-steps`** | P5–P6：`steps[]` 形状、`inputParams` / `outputParams`、条件分支 |
| **`workspace-editing`** | `.quicker` 布局、workspace 工具、file 外置、禁止项 |
| **`action-variables`** | `variables[]` 类型、`quicker_in_param` 边界 |
| **`expressions`** | P4 **首选**：`$=`、`$$`、`sys:evalexpression`（LINQ/字符串/多变量） |
| **`implementation-fallback`** | P4：表达式不够或无模块时的回退（csscript / runScript） |
| **`subprogram-workflow`** | 公共子程序 vs 动作内子程序 |
| **`step-runner-search`** | P5：目录搜索 OR/通配 |
| **`step-modules`** | P5：常用 stepRunnerKey（大表 `docs_get_reference`） |

## 常见错误（由工具返回的 `errorMessage` / stderr）

| 场景 | 对策 |
|------|------|
| 猜 `inputParams` 键名 | **`qkrpc_step_runner_get`** |
| 长脚本/字符串塞进 `value` | 超过 4 行用 **`files/`** + `"file": "files/…"`（**`action-steps`**） |
| `outputParams` 写成 `{ "varKey": "…" }` | 输出值为 **变量 key 字符串**（可 `dictVar.key`），见 **`action-steps`** |
| 猜 `callIdentifier` | `qkrpc_subprogram_search` / `get` |
| 猜 icon | `qkrpc_fa_search` |
| 保存后反复 get 确认 | 用 **`editVersion`**、`projectSummary`；改完 **直接 `qkrpc_action_patch`**（内置校验） |
| 传内联 patch JSON（`op` / add / update） | 改 **`data.json`** + **`qkrpc_action_patch({ id })`**（见 **`workspace-editing`**） |
| 手写 `.quicker/.../data.json` 路径 | `workspace_action_*_data({ id })` |
| create 后再 **`action_get`** | 用 create 返回值；直接 **`workspace_action_*_data`** → patch |
| 对空动作 **get** 期望落盘 | 空程序不写 `data.json`；先 write_data 或编辑后再 get |


---
name: quicker-authoring
description: "Routes Quicker headless action editing (P0–P7): pick workflow topic, then schema/step-runner refs. Use when creating or editing Quicker actions, subprograms, steps, or data.json on disk."
allowed-tools: docs
compatibility: "QuickerAgent (agent-ui); requires Quicker + QuickerRpc plugin"
---

# Quicker 动作无头编辑

无头编辑 XAction：**agent-ui 工具** + QuickerRpc 插件。流程专题见 **`docs_index`**；参数/字段以各工具 description 为准，勿在回复中粘贴指南全文。

## 先选路径

| 用户意图 | 第一个 `docs_get` topic |
|----------|-------------------------|
| 写/改动作程序体 | **`authoring-workflow`** |
| 改 `.quicker` 磁盘 / workspace 工具 | **`workspace-editing`** |
| 公共/内嵌子程序 | **`subprogram-workflow`** |
| 整理动作页/移动/归集 | **`action-organization-workflow`** |
| 打开 Quicker 设置/UI | **`quicker-ui`** |
| 找步骤模块 | **`step-runner-search`** → **`step-runner-get`** |
| 选动作/菜单图标 | **`action-icons`** |
| WebView2 / 自定义 HTML 页 | **`webview2-authoring`** |

## P0–P7 摘要

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

**逐步操作**：**`authoring-workflow`**。**工作区**：**`workspace-editing`**。

## 硬规则

- 未 **`qkrpc_step_runner_get`** 禁止猜 `inputParams` 键名
- **禁止** `get-ui` / `step-runner.getUi`
- **禁止**内联 patch JSON / **`--patch-file`**（用 **`workspace_program`** 改磁盘后 patch）
- 保存后以 **`editVersion`** 为准，禁止反复 get 确认
- P4 **表达式优先**（**`expressions`**），再专用模块，最后 csscript

## 深入阅读

| 层 | 入口 topic |
|----|------------|
| 总览与完整索引 | **`overview`** |
| 工作流 | **`authoring-workflow`**、`workspace-editing`、`subprogram-workflow` |
| 数据形状 | **`action-steps`**、**`action-variables`**、**`expressions`** |
| 步骤模块 | **`step-modules`** + `docs_get_reference`（仅 `_catalog` 标记有 reference 的模块） |

按需 `docs_get`；**勿**在会话开头连续多篇全文。目录：**`docs_index`** / **`docs_search`**。


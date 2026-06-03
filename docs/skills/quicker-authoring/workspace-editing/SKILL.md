---
name: workspace-editing
description: ".quicker/actions/{actionId} 工作区布局、workspace_* 工具分工、file 外置与 qkrpc_action_patch 保存。Use when editing data.json or files/ on disk in agent-ui."
allowed-tools: qkrpc_action_get qkrpc_action_validate qkrpc_action_patch workspace_action_projects workspace_action_read_data workspace_action_write_data workspace_action_edit_data workspace_file_read workspace_file_write workspace_file_edit
compatibility: "QuickerAgent; requires working directory in sidebar"
---

# 工作区编辑（Agent）

**何时读**：P2、P6；在改 `data.json` 或 `files/` 之前。工具参数见各 **`workspace_*`** / **`qkrpc_action_*`** 的 description。

## 模型

```text
Quicker 库  ←—— qkrpc_action_patch({ id }) ——  .quicker/actions/{actionId}/
              ←—— qkrpc_action_get({ id })  ——   （自动 extract，勿手动）
```

- 目录名默认 **= actionId（GUID）**；旧项目可能是可读名，以 `info.json` 里的 `id` 为准。
- **`data.json`**：仅 **`steps`** + **`variables[]`**（压缩 XAction 形状，无 `subPrograms` 数组）。
- **`info.json`**：id、title、icon、editVersion 等元数据。
- **`files/`**：长脚本等外置内容；`data.json` 里用 `"file": "files/…"` 引用（与 `value` / `varKey` 互斥）。

## 目录

```text
.quicker/
  actions/{actionId}/
    info.json
    data.json
    files/              # inputParams.*.file
    subprograms/        # 动作内子程序（规划中）
  subprograms/{name}/   # 公共子程序（全局）
```

## 工具分工

| 目的 | 工具 |
|------|------|
| 列出本地动作项目 | **`workspace_action_projects`** |
| 读 steps + variables | **`workspace_action_read_data({ id })`** — 改前读内容；**`mode: "summary"`** 仅摘要/校验 |
| 校验项目（改后） | **`qkrpc_action_validate({ id })`** 或 **`read_data` + `mode: "summary"`** |
| 整份替换 data.json | **`workspace_action_write_data({ id, content })`** |
| 局部改 data.json | **`workspace_action_edit_data({ id, oldString, newString })`** |
| 读/写/改 files/ 下文件 | **`workspace_file_read` / `write` / `edit`** |
| 拉取并同步磁盘 | **`qkrpc_action_get({ id })`** → 响应 **`workspaceProject`**（`projectDirectory`、步/变量计数等摘要；完整流程见本文） |
| 写回 Quicker | **`qkrpc_action_patch({ id })`** — **仅 id**，无内联 JSON |

## 典型链

```text
qkrpc_action_get
  → workspace_action_read_data
  → qkrpc_step_runner_get（每个新步骤或改参）
  → workspace_action_edit_data | write_data
  → [可选] workspace_file_* 改 scripts
  → qkrpc_action_patch
```

## file 外置

`data.json` 中（保存前由 patch 编译进 Quicker）：

```json
"script": { "file": "files/main.cs" }
```

路径相对 **项目目录**，用 `/`，禁止 `..`。外置项见 `workspaceProject.fileRefCount`；清单细节用 **`workspace_action_projects`** 或 **`action validate`**。

## 与 CLI 的区别

| | Agent（本专题） | CLI |
|--|-----------------|-----|
| 改盘 | `workspace_*` + `patch({ id })` | `extract` / 手改 / `apply`，或 **`patch-workflow`** 内联 JSON |
| 勿用 | 内联 patch JSON、手动 extract/apply | — |

## 禁止

- 用 **`workspace_file_*`** 读写 **`data.json`**（用 **`workspace_action_*_data`**）
- 手动拼 `.quicker/actions/...` 路径（一律传 **action GUID**）
- patch 成功后仅为核对再 **`get`**
- 改后用全量 **`workspace_action_read_data`** 仅为验证（用 validate / summary / edit 响应的 **projectSummary**）

## 相关

`authoring-workflow` · `variables` · `overview`


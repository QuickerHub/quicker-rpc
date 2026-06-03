# 工作区编辑（Agent）

**何时读**：P2、P6；在改 `data.json` 或 `files/` 之前。工具参数见各 **`workspace_*`** / **`qkrpc_action_*`** 的 description。

## 模型

```text
Quicker 库  ←—— qkrpc_action_patch({ id }) ——  .quicker/actions/{actionId}/
              ←—— qkrpc_action_get({ id })  ——   有步骤/变量时 extract（空动作跳过 data.json）
              ←—— qkrpc_action_create       ——   仅写 info.json（勿再 get）
```

- 目录名默认 **= actionId（GUID）**；旧项目可能是可读名，以 `info.json` 里的 `id` 为准。
- **`info.json`**：标题、图标、`editVersion` 等；**create** 后即有，**get** 不覆盖空程序体到 `data.json`。
- **`data.json`**：仅 **`steps`** + **`variables[]`**（压缩 XAction 形状，无 `subPrograms` 数组）。步骤字段见 **`action-steps`**。
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
| 读 steps + variables | **`workspace_action_read_data({ id })`** — 改前读内容；**`mode: "summary"`** 仅在不保存时看结构/校验 |
| 改后保存 | **`qkrpc_action_patch({ id })`** — **直接调用**（内置 validate → apply），**勿**先单独校验 |
| 整份替换 data.json | **`workspace_action_write_data({ id, content })`** |
| 局部改 data.json | **`workspace_action_edit_data({ id, oldString, newString })`** |
| 读/写/改 files/ 下文件 | **`workspace_file_read` / `write` / `edit`** |
| 拉取并同步磁盘 | **`qkrpc_action_get({ id })`**（非空程序体才 extract）→ **`workspaceProject`** |
| 新建落盘 | **`qkrpc_action_create`** → 仅 **`info.json`**；**勿**紧接再 get |
| 写回 Quicker | **`qkrpc_action_patch({ id })`** — **仅 id**，无内联 JSON |

## 典型链

```text
# 新建
qkrpc_action_create → workspace_action_write_data | edit_data → qkrpc_action_patch

# 已有（非空）
qkrpc_action_get → workspace_action_read_data → qkrpc_step_runner_get
  → workspace_action_edit_data | write_data → [可选] workspace_file_*
  → qkrpc_action_patch
```

## file 外置（长 `inputParams`）

**规则**：**超过 4 行**或很长字符串/脚本 → 放 **`files/`**，`data.json` 只写 `"file": "files/…"`，勿用长 `"value"`（见 **`action-steps`**）。

`data.json` 引用（**`qkrpc_action_patch`** 时编译进 Quicker）：

```json
"script": { "file": "files/main.cs" }
```

`file` 与 `value` / `varKey` 互斥。路径相对 **项目目录**，用 `/`，禁止 `..`。

{{#only-agent}}
| 步骤 | 工具 |
|------|------|
| 写外置文件 | **`workspace_file_write`** / **`workspace_file_edit`**（路径如 `files/foo.cs`） |
| 改 `data.json` 绑定 | **`workspace_action_edit_data`** — `"paramKey": { "file": "files/foo.cs" }` |
| 保存 | **`qkrpc_action_patch({ id })`** |
{{/only-agent}}

外置项见 `workspaceProject.fileRefCount`；清单用 **`workspace_action_projects`** 或 **`action validate`**。

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

`authoring-workflow` · `action-steps` · `action-variables` · `overview`

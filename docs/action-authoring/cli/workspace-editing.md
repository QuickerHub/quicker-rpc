# 工作区编辑

**何时读**：P2、P6；在改 `data.json` 或 `files/` 之前。工具参数见 **`workspace_program`** description（`target` + `action`）。

## Checklist（工作区）

```text
- [ ] target + id（+ subProgramId?）与磁盘目录一致
- [ ] 非空程序体：先 get 再改盘；新建后勿再 get
- [ ] 改 data.json：read_data / edit_data / write_data（勿 file_* 改 data.json）
- [ ] 长脚本/字符串（>4 行）：files/ + "file": "files/…"
- [ ] 保存：仅 workspace_program patch（勿 --patch-file / 内联 op JSON）
- [ ] patch 后：以 editVersion / projectSummary 为准；可选 diagnostics
```

## 模型

```text
Quicker 库  ←—— workspace_program({ action: "patch", target, id }) ——  .quicker/…/
              ←—— qkrpc_action_get / qkrpc_subprogram_get ——  非空程序体 extract 到磁盘
```

- 侧边栏 **工作目录** = qkrpc / workspace 的 cwd；所有路径相对该目录。
- **`info.json`**：标题、图标、`editVersion`、`callIdentifier`（子程序）等；**create** 后即有，**get** 不覆盖空程序体到 `data.json`。
- **`data.json`**：仅 **`steps`** + **`variables[]`**（压缩 XAction 形状）。步骤字段见 **`action-steps`**。
- **`files/`**：长脚本等外置；`data.json` 里 `{ "file": "files/…" }`（与 `value` / `varKey` **三选一**）。

## `target` 与目录

| `target` | `id` | 磁盘根目录 |
|----------|------|------------|
| **`action`**（默认） | 动作 GUID | `.quicker/actions/{actionId}/` |
| **`global_subprogram`** | 子程序 id 或名称 | `.quicker/subprograms/{idOrName}/` |
| **`embedded_subprogram`** | 父动作 GUID | `.quicker/actions/{actionId}/subprograms/{subProgramId}/` |

`embedded_subprogram` 还须 **`subProgramId`**（动作内子程序 GUID）。

目录名默认 **= GUID**；旧项目可能是可读名，以 `info.json` 里的 `id` 为准。

## `workspace_program` 分工

统一工具：**`workspace_program({ action, target, id, subProgramId? })`**。旧名 **`workspace_action_*`** / **`workspace_program_patch`** 仅为兼容别名，文档与 Agent 一律写 **`workspace_program`**。

| `action` | 用途 |
|----------|------|
| **`projects_list`** | 列出 `.quicker/actions/` 与 `.quicker/subprograms/` 本地项目 |
| **`read_data`** | 读 `data.json`（改前）；**`mode: "summary"`** 仅看不保存时的结构 |
| **`write_data`** | 整份替换 `data.json` |
| **`edit_data`** | 局部改 `data.json`（**`oldString` 须唯一**） |
| **`file_read` / `file_write` / `file_edit` / `file_info` / `file_search`** | `path: "files/…"` 外置资源 |
| **`patch`** | 将磁盘 `data.json`（+ `files/` 编译）写回 Quicker（动作 apply / 子程序 import / 父动作 apply） |
| **`diagnostics`** | patch 后表达式/C# 语法检查（**`waitMs`** 可选） |

保存：**仅 `patch`** — **勿**传内联 patch JSON（无 `op` / add / update / `--patch-file`）。

## 典型链

```text
# 动作 — 新建
qkrpc_action_manage create → workspace_program write_data|edit_data (target=action)
  → workspace_program patch

# 动作 — 已有（非空）
qkrpc_action get → workspace_program read_data → qkrpc_step_runner_get
  → workspace_program edit_data|write_data → [file_*] → workspace_program patch

# 公共子程序 — 已有
qkrpc_subprogram get → workspace_program read_data (target=global_subprogram)
  → workspace_program edit_data → workspace_program patch

# 动作内子程序
qkrpc_action get → workspace_program read_data (target=embedded_subprogram, subProgramId=…)
  → edit_data → patch (target=embedded_subprogram)

# 复制模板
get(模板) → read / file_read → get(目标) → write / file_write(目标) → patch(目标)
```

同步：首次改盘前 **`qkrpc_action get`** 或 **`qkrpc_subprogram get`**（非空才写 `data.json`）。新建后 **勿**再 get。

## file 外置（长 `inputParams`）

**规则**：**超过 4 行**或很长字符串/脚本 → **`files/`**，`data.json` 只写 `"file": "files/…"`（见 **`action-steps`**）。

```json
"script": { "file": "files/main.cs" }
```

路径相对 **项目目录**，用 `/`，禁止 `..`。

## 大文件编辑（Agent）

```text
file_info → file_search（可选）→ file_read(startLine/maxLines) → file_edit(唯一 oldString)
```

- **`file_edit`**：禁止用 **`file_write`** 改大文件中的一小段。
- **`read_data`**：改前优先 **`mode: "summary"`**；定位问题用 **`startLine`/`endLine`** 切片，勿从第 1 行扫全文。
- patch 后：**`workspace_program diagnostics`**；用 **`issues[].location.read`** 修语法。

## 与 CLI 的区别

| | Agent（本专题） | CLI |
|--|-----------------|-----|
| 改盘 | **`workspace_program`** + **`patch`** | `extract` / 手改 / `apply`，或 **`patch-workflow`** **`--patch-file`** 内联 JSON |
| 子程序体 | **`edit_data`** on `.quicker/subprograms/…/data.json` | `subprogram patch --patch-file` |
| 禁止 | **`--patch-file`**、增量 `{ "op": "update", "stepId": … }` JSON | — |

## 禁止

- Agent 用 **`qkrpc subprogram patch --patch-file`** / **`qkrpc action patch --patch-file`** 改程序体（CLI 专用）
- **`workspace_program file_*`** 改 **`data.json`**（用 **`read_data` / `write_data` / `edit_data`**）
- 手写 **`.quicker/…`** 绝对路径（传 **GUID/名称** + `files/…`）
- patch 成功后仅为核对再 **`get`**
- 改后用全量 **`read_data`** 仅为验证（用 patch / edit 响应的 **`projectSummary`** 或 **`diagnostics`**）

## 相关

`authoring-workflow` · `subprogram-workflow` · `action-steps` · `action-variables` · `overview`

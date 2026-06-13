# Action Designer 与 Agent 程序读写

当用户在 Quicker 中打开 **动作设计器**（`ActionDesignerWindow`）时，`qkrpc` 的 `action get/patch` 与 `subprogram get/patch` 会**自动**走设计器内存，无需单独的 `designer.get` / `designer.patch` API。

Agent 仍使用原有命令与 MCP 工具（`qkrpc_action_get`、`workspace_program` 的 pull 等）；插件在 `HeadlessActionProgramService` / `HeadlessSubProgramProgramService` 入口委托 `ActionDesignerProgramBridge` 完成路由。

## 行为总览

| 命令 | 设计器已打开且 entityId 匹配 | 设计器未打开 |
|------|------------------------------|--------------|
| `action get` / `subprogram get` | 从设计器内存读（含**未保存草稿**） | 从 catalog / DataService 读 |
| `action patch` / `subprogram patch` | 写入设计器内存，**默认不落库** | 一次 patch = 一次 catalog 保存 |

设计器打开时，即使动作尚未入库（新建草稿），只要窗口 entityId 匹配，get/patch 仍可成功。

## 响应字段（调试 / Agent 判断）

JSON 响应（CLI `--json` 或 MCP）在原有字段基础上增加：

| 字段 | 类型 | 含义 |
|------|------|------|
| `readSource` | string | `"action-designer"` 或 `"catalog"` |
| `appliedToDesigner` | bool? | patch 是否写入设计器内存 |
| `persisted` | bool? | 是否已持久化到 catalog |
| `presentationUpdated` | bool? | 是否更新了 title/description/icon 等（action patch） |

压缩 JSON 内也可能含 `readSource`、`designerOpen`（get 成功时）。

patch 成功且写入设计器内存时，stderr / `warnings` 含：

```text
applied_to_action_designer_memory; save in Quicker to persist to catalog
```

**Agent 无需额外 API**；看到 `persisted: false` 时应提示用户在 Quicker 设计器点「保存」。

## `editVersion` 与设计器模式

- **catalog**：`LastEditTimeUtc` 毫秒时间戳（与历史行为一致）。
- **action-designer**：`steps` + `variables` 体的 SHA256 摘要（稳定 revision token，**不含** metadata 变更）。

因此仅改 title/description 时 `editVersion` 可能不变；程序体变更后 `editVersion` 会变。版本冲突时 re-read 或 `--force`。

## Patch 支持的字段

与 catalog 路径相同，可在**同一次 patch** 中组合 program 与 metadata：

### 动作 `action patch`

| 字段 | 说明 |
|------|------|
| `steps` / `variables` | 程序体局部 patch |
| `title` | 标题（不可空） |
| `description` | 说明；空字符串清空 |
| `icon` | Font Awesome 或 URL |
| `contextMenuData` | 右键菜单数据 |

### 子程序 `subprogram patch`

| 字段 | 说明 |
|------|------|
| `steps` / `variables` | 程序体 |
| `name` 或 `title` | 子程序名 |
| `description` / `icon` | 同动作 |

设计器打开时 metadata 写入 `EditingActionItem` / `ResultActionItem`（及 v2 对应项），并刷新 `UpdateXActionUi`、窗口标题。

## 实现要点（维护者）

```text
HeadlessActionProgramService.GetCompressedActionById
  └─ ActionDesignerProgramBridge.TryGetCompressedAction  → 设计器 export
  └─ 否则 catalog

HeadlessActionProgramService.ApplyActionPatchToAction
  └─ ActionDesignerProgramBridge.TryApplyActionPatch
       ├─ 程序体：XActionPatchApplier → ActionDesignerUiSave.TrySyncDesignerMemory
       └─ metadata：ActionDesignerUiSave.TrySyncDesignerPresentation
  └─ 否则 catalog 保存

子程序：TryGetCompressedSubProgram / TryApplySubProgramPatch（同样逻辑）
```

- 读：`ActionDesignerContext.TryExportXActionJson`
- 写程序体：`ActionDesignerUiSave.TrySyncDesignerMemory`（`Action` + `UpdateXActionUi` + `ResultActionItem.Data`）
- 写 metadata：`DesignerEntityPresentation` + `TrySyncDesignerPresentation`
- 找窗口：`ActionDesignerUiSave.TryFindActionDesignerWindow(entityId, isSubProgram)`

## 限制

| 项 | 说明 |
|----|------|
| 撤销栈 | 设计器内存 patch **不**接入 Quicker `HistoryManager`；整包替换，Undo 行为与手动编辑不同 |
| 持久化 | 必须用户在 Quicker 点保存；Agent patch 不会自动 `SaveEditingAction` |
| 共享动作只读 | 只读动作 patch 会在 bridge 前被 `ActionReadOnlyMutationGuard` 拒绝 |

## 相关能力（非本路由）

| 能力 | 入口 |
|------|------|
| 设计器上下文（选中步骤、变量等） | `designer.context` serve op / 嵌入 AI Tab |
| 磁盘工作区编辑 | `workspace_program` + `.quicker/` |
| 仅改 catalog 元数据（设计器关闭时） | `action set-metadata` |

## CLI 示例

设计器已打开时读取草稿：

```powershell
qkrpc action get --id <guid> --return-mode full --json
# readSource: "action-designer"
```

仅改标题（设计器内存）：

```powershell
qkrpc action patch --id <guid> --patch '{"title":"新标题"}' --expected-edit-version <N> --json
# persisted: false, presentationUpdated: true
```

程序 + metadata 同 patch：

```powershell
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

## 参见

- [cli-commands.md](cli-commands.md) — 命令选项
- [quicker-action-data-storage.md](quicker-action-data-storage.md) — 动作存储
- `qkrpc guide get --topic authoring-workflow --json` — Agent 编写流程

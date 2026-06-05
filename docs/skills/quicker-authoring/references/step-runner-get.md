# 步骤模块 schema

**何时读**：**`overview`** P5 — 在 **`step-runner-search`** 定好 `items[].key`（及 `controlField`）之后、写 `data.json` 的 `inputParams` 之前。

## Agent vs UI（必读）

| 通道 | 调用 | 返回 |
|------|------|------|
| **Agent** | **`qkrpc_step_runner_get`** | 压缩 schema：Default 参数形状、`controlField.selection[]`（含 `visibleInputKeys`）；**无**模块级 `icon` |
| **UI only** | `qkrpc step-runner get-ui` / serve `step-runner.getUi` | 完整 schema（含 `icon`、全部 control 选项）；**仅供 action-editor** |

聊天工具只有 **`qkrpc_step_runner_get`**，没有 get-ui。**禁止**为拿图标或完整 UI 字段去调 CLI `get-ui`。动作图标用 **`qkrpc_fa_search`**。

## 与 search 的分工

| 步骤 | 职责 |
|------|------|
| **search** | 发现 `key`、非空 query 时带 `items[].controlField`、排序与 `snippet` |
| **get** | `inputParams` / `outputParams` **键名与类型**；有 control 时展开当前模式的可见字段 |

Search **不**再附带 `agentGuidance` 长文（避免每次检索重复占 context）。流程说明在 **`authoring-workflow`**、**`action-steps`**、系统提示。

`inputParams` 绑定形状（`value` / `varKey` / 外置 **`{ "file": "files/…" }`**）见 **`action-steps`**、**`action-project-files`**；get 的 schema 只列参数键名，不重复 file 规则。

## 调用

```text
qkrpc_step_runner_get({ key: "sys:MsgBox" })
qkrpc_step_runner_get({ key: "sys:windowOperations", controlField: "move_ex" })
```

- Search 命中带 **`controlField`** 时，get **必须**传 **`controlField`** = **`controlField.value`**。
- Search **无** `controlField` 时，可省略 control 参数；此时 `controlField.selection[]` 列出各模式及 `visibleInputKeys`。
- **禁止** `get-ui` / `step-runner.getUi`；仅用 **`qkrpc_step_runner_get`**

## 禁止

- 未 **`qkrpc_step_runner_get`** 就猜 `inputParams` 键名
- 调用 `get-ui` 或 HTTP `step-runner.getUi`
- 有 `controlField` 却省略 control 参数、或猜其它 control 值

## 相关

`step-runner-search` · `action-steps` · `authoring-workflow`（P5）

# {{#topic-title}}

**何时读**：**`overview`** P5 — 在 **`step-runner-search`** 定好 `items[].key`（及 `controlField`）之后、写 `data.json` 的 `inputParams` 之前。

## Agent vs UI（必读）

| 通道 | 调用 | 返回 |
|------|------|------|
| **Agent** | {{#ref step-runner.get.invoke}} | 压缩 schema：Default 参数形状、`controlField.selection[]`（含 `visibleInputKeys`）；**无**模块级 `icon` |
| **UI only** | `qkrpc step-runner get-ui` / serve `step-runner.getUi` | 完整 schema（含 `icon`、全部 control 选项）；**仅供 action-editor** |

{{#only-agent}}聊天工具只有 **`qkrpc_step_runner_get`**，没有 get-ui。**禁止**为拿图标或完整 UI 字段去调 CLI `get-ui`。动作图标用 **`qkrpc_fa_search`**。{{/only-agent}}
{{#only-cli}}脚本/Agent 流程只用 **`step-runner get`**；`get-ui` 留给 agent-gui 动作编辑器 API，勿在自动化里调用。{{/only-cli}}

## 与 search 的分工

| 步骤 | 职责 |
|------|------|
| **search** | 发现 `key`、非空 query 时带 `items[].controlField`、排序与 `snippet` |
| **get** | `inputParams` / `outputParams` **键名与类型**；有 control 时展开当前模式的可见字段 |

Search **不**再附带 `agentGuidance` 长文（避免每次检索重复占 context）。流程说明在 **`authoring-workflow`**、**`action-steps`**、系统提示。

## 调用

{{#only-cli}}
```powershell
{{@ step-runner.get}}
{{@ step-runner.get.control}}
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ step-runner.get}}
{{@ step-runner.get.control}}
```
{{/only-agent}}

- Search 命中带 **`controlField`** 时，get **必须**传 {{#ref control-field.get}} = **`controlField.value`**。
- Search **无** `controlField` 时，可省略 control 参数；此时 `controlField.selection[]` 列出各模式及 `visibleInputKeys`。
- {{#ref step-runner.get-ui.forbidden}}

## 禁止

- 未 {{#ref step-runner.get.invoke}} 就猜 `inputParams` 键名
- {{#only-agent}}调用 `get-ui` 或 HTTP `step-runner.getUi`{{/only-agent}}{{#only-cli}}Agent/脚本使用 `step-runner get-ui`{{/only-cli}}
- 有 `controlField` 却省略 control 参数、或猜其它 control 值

## 相关

`step-runner-search` · `action-steps` · `authoring-workflow`（P5）

# {{#topic-title}}

**何时读**：编辑 `data.json` 里的 **`variables[]`**。步骤里如何绑 `inputParams` / `outputParams` 见 **`action-steps`**。

{{#only-agent}}
**Agent**：用 **`workspace_action_read_data` / `write_data` / `edit_data`** 改 `data.json` 里的 **`variables[]`**（传 action GUID），保存 **`qkrpc_action_patch({ id })`**。勿传内联 patch JSON。
{{/only-agent}}
{{#only-cli}}
**CLI**：`action patch` 的 `variables[]` 操作见 **`patch-workflow`**。
{{/only-cli}}

稳定标识：**`key`**（不要用临时 `id`）。

## 类型（写入 data.json）

| `type` | 读取时 `varType`（若有） |
|--------|-------------------------|
| `0` | 省略 = 文本 |
| `1` | `number` |
| `2` | `boolean` |
| `12` | `integer` |
| `13` | `table` |

`defaultValue` 在 JSON 里 **始终是字符串**（`"42"`、`"true"`）。可写 `"varType": "integer"` 等，保存时宿主会规范为 `type`。

长默认值（超过 **4 行** 或 **240 字符**）在 `action extract` / `validate` 时会外置为 `defaultValueFile`（如 `files/myvar-default1.txt`），`apply`/`patch` 前自动读回为 `defaultValue`。`defaultValueFile` 与内联 `defaultValue` 互斥。

## 与步骤的关系

步骤通过 `inputParams.varKey` 读取变量、通过 `outputParams` 的字符串值写入变量（含 `dictVar.key`）。完整步骤 JSON 见 **`action-steps`**；表达式里引用变量见 **`expressions`**（只用 `{varKey}`，勿写 `v_` 前缀）。

## `quicker_in_param`（勿进 variables[]）

运行入参由 Quicker 注入为 **`quicker_in_param`**，**不在** `variables[]` 声明，也 **不要** 写入 `data.json` 的 `variables[]`。完整说明见 **`expressions`** 专题。

## 相关

`action-steps` · `workspace-editing` · `expressions` · `authoring-workflow` · `overview`

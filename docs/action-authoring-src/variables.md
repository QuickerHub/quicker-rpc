# 动作变量（variables[]）

**何时读**：编辑 `data.json` 里的 **`variables[]`** 或步骤里的 `varKey` / `outputParams` 绑定时。

{{#only-agent}}
**Agent**：用 **`workspace_action_read_data` / `write_data` / `edit_data`** 改 `variables[]`（传 action GUID），保存 **`qkrpc_action_patch({ id })`**。勿在 patch 里传内联 `variables` JSON。
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

## 绑定

```json
"inputParams": { "text": { "varKey": "userName" } },
"outputParams": { "result": "myVar" }
```

表达式里引用变量见 **`expressions`**（只用 `{varKey}`，勿写 `v_` 前缀）。

## `quicker_in_param`（勿进 variables[]）

运行入参由 Quicker 注入为 **`quicker_in_param`**，**不在** `variables[]` 声明，也 **不要** patch/`add` 该键。完整说明见 **`expressions`** 专题。

## 相关

`workspace-editing` · `expressions` · `authoring-workflow` · `overview`

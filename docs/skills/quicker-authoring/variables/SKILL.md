---
name: variables
description: "动作变量类型、读取与 variables patch 操作。Use when adding or editing action variables in patch JSON."
allowed-tools: qkrpc_action_get qkrpc_action_patch
metadata:
  phase: "P2-P6"
---

# Variables
**链路位置**：**`overview`** P2 读 / P6 patch。稳定 id：**`key`**（非临时 `id`）。
## Runtime-only: `quicker_in_param`
动作/子程序 **运行入参** 由 Quicker 注入为变量 `quicker_in_param`（字符串）。它 **不在** `variables[]` 中声明，patch 时不要 `add`/`update` 该键。用法见 **`expressions`** 专题「`quicker_in_param`」。
## Types when writing
| `type` | `varType` when read |
|--------|---------------------|
| `0` | *(omitted = text)* |
| `1` | `number` |
| `2` | `boolean` |
| `12` | `integer` |
| `13` | `table` |
| … | See compressed read for other names |
`defaultValue` is always a **string** in JSON (`"42"`, `"true"`).
Patch/update may send `"varType": "integer"`; host normalizes to `type` on save.
## Binding
```json
"inputParams": { "text": { "varKey": "userName" } }
"outputParams": { "result": "myVar" }
```
Variable patch ops: same `op` vocabulary as steps in **`qkrpc_action_patch`** (see **`patch-workflow`** example).
## 相关
`patch-workflow` · `xaction-json` · `overview`


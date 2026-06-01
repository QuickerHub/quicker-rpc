# Patch workflow
**`action patch`**：一次 CLI = 一次保存。前置：每个新/改步骤先 **`step-runner get`**（**`authoring-workflow`** P5）。
## 顶层形状
```json
{
  "title": "可选",
  "description": "可选，\"\" 清空",
  "icon": "<spec>",
  "steps": [ { "op": "add|update|remove|move", ... } ],
  "variables": [ { "op": "update", "key": "k", "defaultValue": "v" } ]
}
```
仅元数据：顶层 `"icon"`（格式 **`action-icons`**）或 **`action set-metadata --icon`**。
```powershell
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```
## inputParams 规则
键名以 **`step-runner get`** 的 `schema.Inputs[].Key` 为准；未知键不阻止保存，在响应 **`warnings[]`** 中列出合法键并可能给出相近建议（退出码仍为 0）。
| 场景 | 写什么 |
|------|--------|
| `add` | 必填 + **控制字段**（`IsControlField`）+ 与 catalog **Default 不同** 的普通参数 |
| `update` | 仅改动的键；换模块时对旧键写 `null` |
| 值 | `{ "value": "..." }` · `{ "varKey": "k" }` · `null` 删键 |
下次 patch 只提交改动项，勿整段回写 `updatedSteps`。
## 保存后
| 响应字段 | 用途 |
|----------|------|
| `editVersion` | 下次 `--expected-edit-version` |
| `addedSteps` | 新 `stepId` |
| `updatedSteps` / `updatedVariables` | 已改项摘要 |
冲突 → `action get` 取新 `editVersion` 或 `--force`。整页替换：`action replace`。仅当前 Quicker 配置内动作。

# {{#topic-title}}

{{#only-agent}}
**Agent 不用增量 patch JSON**（无 `op` / add / update / remove、无 **`--patch-file`**）。改 **`.quicker/…/data.json`** / **`files/`**，保存 **`workspace_program({ action: "patch", target, id })`** — 见 **`workspace-editing`**。
{{/only-agent}}
{{#only-cli}}
{{#ref patch.invoke}}：一次调用 = 一次保存。前置：每个新/改步骤先 {{#ref step-runner.get.invoke}}（**`authoring-workflow`** P5）。

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

**增量 patch**（默认）：可只传 `steps` 或 `variables` 之一。`steps[]` 中单条且仅含 `stepRunnerKey`（无 `stepId`/`id`、无 `ifSteps`/`elseSteps`）时省略 `op` 视为 **`add`**；`update` / `remove` / `move` 须写明 `op`。

**整页替换**（等同 `action replace`）：须 `"replace": true`（或 `"mode": "replace"`），且同时提供 **`steps` 与 `variables`**（可含 `subPrograms`）。本地 `data.json` 仍只有 steps+variables。

```json
{
  "replace": true,
  "steps": [ ... ],
  "variables": [ ... ],
  "subPrograms": []
}
```

### `add` 插入位置（steps / variables）

| 写法 | 行为 |
|------|------|
| 仅 `{ "stepRunnerKey": "...", "inputParams": { ... } }` | 追加到根步骤列表末尾（可省略 `op`） |
| `{ "containerPath": "1/if", "stepRunnerKey": "...", ... }` | 追加到该分支末尾 |
| `{ "op": "add", "index": N, ... }` | 插入下标（可选 `containerPath`） |
| `{ "after": { "stepId": "..." }, ... }` | 锚点之后 |
| `{ "before": { "stepId": "..." }, ... }` | 锚点之前 |
| `{ "op": "add", "key": "x", "variable": ... }` | 变量追加到 `variables[]` 末尾（或 `afterKey` / `beforeKey` / `index`） |

仅元数据：顶层 `"icon"`（`fa search`）或 {{#ref patch.set-metadata.alt}}。

```powershell
{{@ action.patch}}
```

## inputParams 规则

键名以 step-runner get 的 `schema.Inputs[].Key` 为准；未知键在 **`warnings[]`** 列出（退出码仍可为 0）。

| 场景 | 写什么 |
|------|--------|
| `add` | 必填 + 控制字段 + 与 catalog Default 不同的普通参数 |
| `update` | 仅改动的键；换模块时对旧键写 `null` |
| 值 | `{ "value": "..." }` · `{ "varKey": "k" }` · `null` 删键 |
| 长 `value`（超过 4 行脚本/字符串） | 写入 `files/`，`data.json` 用 `{ "file": "files/…" }`（勿超长内联 `value`）→ **`action-project-files`** / **`action-steps`** |

## outputParams / inputParams

键名与值形状见 **`action-steps`**（输出为变量 key 字符串，输入为 `{ "value" }` / `{ "varKey" }` 对象）。

## 保存后

| 响应字段 | 用途 |
|----------|------|
| `editVersion` | {{#ref edit-version.next}} |
| `addedSteps` | 新 `stepId` |
| `updatedSteps` / `updatedVariables` | 已改项摘要 |

冲突 → {{#ref action.get.retry}} 或 `force`。

## 相关

`authoring-workflow` · `action-steps` · `action-project-files` · `action-variables` · `overview`
{{/only-cli}}

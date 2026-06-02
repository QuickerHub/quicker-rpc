# Patch workflow

**`action patch`**：一次调用 = 一次保存。前置：每个新/改步骤先 **`step-runner get`**（**`authoring-workflow`** P5）。

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

**增量 patch**（默认）：在现有程序上增删改；可只传 `steps` 或 `variables` 之一。`steps[]` 中单条且仅含 `stepRunnerKey`（无 `stepId`/`id`、无 `ifSteps`/`elseSteps`）时省略 `op` 视为 **`add`**；`update` / `remove` / `move` 须写明 `op`。

**整页替换**（等同 `action replace`：先清空再写入）：须显式 `"replace": true`（或 `"mode": "replace"`），且同时提供 **`steps` 与 `variables` 两个数组**（可与 `action get --return-mode full` / `action replace` 相同 JSON，含 `subPrograms`）。不能靠省略 `op` 推断整页替换。

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

| 仅 `{ "stepRunnerKey": "...", "inputParams": { ... } }` | **追加到根步骤列表末尾**（可省略 `op`） |

| `{ "containerPath": "1/if", "stepRunnerKey": "...", ... }` | 追加到该分支列表末尾（无需 `index`） |

| `{ "op": "add", "index": N, "stepRunnerKey": "...", ... }` | 插入到指定下标（可选 `containerPath`） |

| `{ "after": { "stepId": "..." }, "stepRunnerKey": "...", ... }` | 锚点之后 |

| `{ "before": { "stepId": "..." }, "stepRunnerKey": "...", ... }` | 锚点之前 |

| `{ "op": "add", "key": "x", "variable": ... }` | 变量默认追加到 `variables[]` 末尾（或用 `afterKey` / `beforeKey` / `index`） |

仅元数据：顶层 `"icon"`（格式 **`action-icons`**）或 **`action set-metadata`**。

```powershell

qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json

```

## inputParams 规则

键名以 **`step-runner get`** 的 `schema.Inputs[].Key` 为准（有控制字段时传 **`--control-field <value>`**，与 search 返回的 `controlFieldValue` 一致）；未知键不阻止保存，在响应 **`warnings[]`** 中列出合法键并可能给出相近建议（退出码仍为 0）。

| 场景 | 写什么 |

|------|--------|

| `add` | 必填 + **控制字段**（`IsControlField`）+ 与 catalog **Default** 不同的普通参数 |

| `update` | 仅改动的键；换模块时对旧键写 `null` |

| 值 | `{ "value": "..." }` · `{ "varKey": "k" }` · `null` 删键 |

| 大文本（本地工程） | `data.json` 中 `{ "file": "path" }` → **`action-project-files`**（import 时编译为 value） |

下次 patch 只提交改动项，勿整段回写 `updatedSteps`。

## 保存后

| 响应字段 | 用途 |

|----------|------|

| `editVersion` | 下次 `--expected-edit-version` |

| `addedSteps` | 新 `stepId` |

| `updatedSteps` / `updatedVariables` | 已改项摘要 |

冲突 → `action get` 取新 `editVersion` 或 `force`。整页写入用 `"replace": true` 的 patch，或 `action replace`。仅当前 Quicker 配置内动作。

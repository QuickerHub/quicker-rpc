# 动作步骤

**何时读**：**`overview`** P5–P6 — 在 `data.json` 里增删改步骤、写 `inputParams` / `outputParams`、嵌套条件分支之前。模块键名与 schema 仍须 **`qkrpc_step_runner_get`**（**`step-runner-search`**）。

**Agent**：用 **`workspace_action_*_data`** 改 `steps[]`，保存 **`qkrpc_action_patch({ id })`**。勿传内联 patch JSON（`op` / `containerPath` 等仅 CLI 见 **`patch-workflow`**）。

## 顶层形状

`data.json` 工作区格式（压缩 XAction）仅含：

```json
{
  "steps": [ /* AgentCompressedStep */ ],
  "variables": [ /* 见 action-variables */ ]
}
```

无 `subPrograms` 数组（子程序调用用 `sys:subprogram` 步骤，见 **`subprogram-workflow`**）。

## 单步字段

| 字段 | 说明 |
|------|------|
| `stepRunnerKey` | 模块 id（如 `sys:MsgBox`） |
| `inputParams` | 输入，见下文 |
| `outputParams` | 输出（变量 key 字符串） |
| `ifSteps` / `elseSteps` | `sys:if` 等结构的子步骤 |
| `stepId` | 宿主分配；新建勿写 |
| `note` · `disabled` · `collapsed` · `delayMs` | 备注 / 禁用 / 折叠 / 延迟 |

## `inputParams`

每个参数键对应一个对象（与输出形状不同）：

```json
"inputParams": {
  "message": { "value": "hello" },
  "text": { "varKey": "userName" },
  "script": { "file": "files/main.cs" }
}
```

| 子字段 | 含义 |
|--------|------|
| `value` | 短字面量，或短 `$=` / `$$`（**`expressions`**） |
| `varKey` | 读已有动作变量的 **`key`** |
| `file` | 外置文件（相对项目目录，`/`）；与 `value` / `varKey` **互斥** |

写入时只填 schema 要求的键；与目录 Default 相同的普通参数可省略（控制字段除外）。

## 长文本：优先 `file` 外置

大段代码、JSON、模板或多行字符串 **不要** 塞进 `data.json` 的 `"value"`。

| 启发式 | 做法 |
|--------|------|
| `value` **超过 4 行**，或明显很长（整段脚本/HTML/PS） | 写入 **`files/`**，`inputParams` 用 **`"file": "files/…"`** |
| `sys:evalexpression` 长 `expression` | **`files/*.eval.cs`**（extract 自动；手改也应用此扩展名） |
| 一两行表达式、短文本 | `"value": "…"` 即可 |
| 绑定变量 | `"varKey": "…"` |

参数键名（`script`、`expression`、`code` 等）以 **`qkrpc_step_runner_get`** 为准；是否支持 `file` 以 schema 为准（多数长文本参数支持）。

```text
workspace_action_file_write({ id, path: "files/main.cs", content: "…" })        // sys:csscript 等
workspace_action_file_write({ id, path: "files/clip.eval.cs", content: "…" })  // sys:evalexpression
  → data.json: "expression": { "file": "files/clip.eval.cs" }
  → qkrpc_action_patch({ id })
```

勿用 `workspace_action_*_data` 把整段脚本塞进一行 `value`。

## `outputParams`

每个输出键的值是 **字符串**，表示写入目标：

```json
"outputParams": {
  "output": "clipText",
  "result": "config.title"
}
```

| 写法 | 含义 |
|------|------|
| `"clipText"` | 写入动作变量 `clipText` |
| `"dictVar.entryKey"` | 写入词典变量 `dictVar` 的 `entryKey` 键 |

绑定与变量声明见 **`action-variables`**；`sys:evalexpression` 的 `output` 参数说明见 **`expressions`**。

## 叶子步骤示例

```json
{
  "stepRunnerKey": "sys:getClipboardText",
  "inputParams": { "format": { "value": "UnicodeText" } },
  "outputParams": { "output": "clipText" }
}
```

须先在 `variables[]` 声明 `clipText`（或词典变量）再绑定输出。

## 条件分支（`sys:if`）

结构步骤在自身 `inputParams` 写条件，子步骤放在 `ifSteps` / `elseSteps`：

```json
{
  "stepRunnerKey": "sys:if",
  "inputParams": {
    "condition": { "value": "$={count} > 0" }
  },
  "ifSteps": [
    {
      "stepRunnerKey": "sys:MsgBox",
      "inputParams": { "message": { "value": "有数据" } }
    }
  ],
  "elseSteps": [
    {
      "stepRunnerKey": "sys:MsgBox",
      "inputParams": { "message": { "value": "无数据" } }
    }
  ]
}
```

条件字段键名以 **`qkrpc_step_runner_get`**（`sys:if`）为准。仅需单分支、无 else 时用 `sys:simpleIf`（`step-runner search` 查 `simpleIf|简单如果`）。

## 选型与禁止

| 规则 | 说明 |
|------|------|
| 先 get 再写参 | 每个新/改步骤 **`qkrpc_step_runner_get`** |
| 数据逻辑 | P4 优先 **`expressions`** / `sys:evalexpression`，勿默认长 **`sys:csscript`** |
| 猜键名 | 禁止；未知键 patch 可能进 `warnings[]` |
| 保存后核对 | 勿仅为确认再全量 get（**`authoring-workflow`** P7） |

## 相关

`action-variables` · `expressions` · `authoring-workflow` · `workspace-editing` · `step-runner-search` · `subprogram-workflow` · `overview`

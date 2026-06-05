# 动作步骤

**何时读**：编写 `data.json` 的 **`steps[]`**、`inputParams` / `outputParams`、条件分支 `ifSteps` / `elseSteps`。模块键名须与 step-runner schema 一致（**`step-runner-get`**）。

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

每个参数键对应一个对象（与输出形状不同）。绑定方式 **三选一**（同一参数对象内只写其中一种）：

```json
"inputParams": {
  "message": { "value": "hello" },
  "text": { "varKey": "userName" },
  "script": { "file": "files/main.cs" }
}
```

| 方式 | 形状 | 含义 |
|------|------|------|
| 字面量 / 表达式 | `{ "value": "…" }` | 短字面量，或带 `$$` / `$=` 前缀的插值/表达式（**`expressions`**） |
| 变量绑定 | `{ "varKey": "…" }` | 直接读动作变量：值为变量的 **`key` 字符串**（非表达式，无前缀求值） |
| 外置文件 | `{ "file": "…" }` | 正文路径（**字符串**，相对项目根，`/`） |

**`file`（workspace）**：外置时写 `"<paramKey>": { "file": "files/…" }`（`file` 的值是路径，不是整段脚本）。**勿**写成 `"<paramKey>": "files/…"`（缺对象包裹），**勿**在同一对象里写 `value`、`varKey`、`file` 中的多个字段。

- 正文在磁盘 `files/`（或其它相对路径，如 `scripts/…`）；**`data.json` 在 patch 前保留 `file` 引用**。
- **`workspace_program_patch`** 时宿主读取该文件，编译为 Quicken 侧的 **`value` 内联字符串**（从 Quicker 拉回工作区时可再导出为 `file`，见 **`action-project-files`**）。

`value` 与 `varKey` 的区别及 `SkipEval` 见 **`expressions`**。只填 schema 要求的键；与目录 Default 相同的普通参数可省略（控制字段除外）。

## 长文本：优先 `file` 外置

大段代码、JSON、模板或多行字符串 **不要** 塞进 `data.json` 的 `"value"`。

| 启发式 | 做法 |
|--------|------|
| `value` **超过 4 行**，或明显很长（整段脚本/HTML/PS） | 正文写入 **`files/`**（`workspace_action_file_write`），`inputParams` 写 **`{ "file": "files/…" }`** |
| `sys:evalexpression` 长 `expression` | **`files/*.eval.cs`**（勿与 `sys:csscript` 的 `.cs` 混用） |
| 一两行表达式、短文本 | `"value": "…"` 即可 |
| 绑定变量 | `"varKey": "…"` |
| **`sys:form` 的 `formDef`** | **默认** `{ "file": "files/*.form.json" }`（`qkrpc.form.v1`，通常很长）→ **`form-spec`** |

参数键名（`script`、`expression`、`code` 等）以 step-runner schema 为准；是否支持 `file` 以该参数定义为准（多数长文本参数支持）。

## `outputParams`

每个输出键的值是 **字符串**（不是 `inputParams` 那种 `{ "varKey": "…" }` 对象），表示写入目标：

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
| 猜键名 | 禁止；键名须来自 step-runner schema |

## 相关

`action-variables` · `expressions` · `action-project-files` · `step-runner-search` · `subprogram-workflow` · `overview`

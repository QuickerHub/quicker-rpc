# {{#topic-title}}

**何时读**：写 `sys:form` 步骤前。工作区 **不要**手写 Quicker 原生 `formDef.value`（PascalCase `FieldKey` JSON）；用 **`qkrpc.form.v1`** 描述字段，保存时由 `qkrpc` 编译进 Quicker。

## 工作流

```powershell
qkrpc step-runner get --key sys:form --control-field variables --json
qkrpc form validate --file form.json --json
qkrpc form build --file form.json --json
qkrpc action apply --dir .quicker/actions/<guid> --json
```

1. 在 `data.json` 的 `sys:form` 步骤写 **`inputParams.formDef.file`**（或 `dynamicFormForDictDef.file`），指向 **`files/*.form.json`**（`qkrpc.form.v1`）。
2. **`action apply`** / **`qkrpc_action_patch`** 仅在发往 Quicker 时编译为原生 `formDef.value`；**磁盘 `data.json` 仍保留 `formDef.file`**，不会写入编译后的 JSON。
3. **`action get` / `extract`** 将 Quicker 内原生 `formDef` **反编译**为 `files/*.form.json`（`qkrpc.form.v1`），并写回 `formDef.file`（可逆；re-extract 会刷新 spec 文件，不会用原生 JSON 覆盖）。
4. 可选：`qkrpc form validate|build` 单独校验或预览。

### data.json 写法（推荐）

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "operation": { "value": "variables" },
    "title": { "value": "填写信息" },
    "formDef": { "file": "files/login.form.json" }
  }
}
```

`files/login.form.json` 内容为 `qkrpc.form.v1`（见下文）。步骤上已写的 `title` / `operation` / `dictVar` 优先于 spec 内同名字段。

### 其它写法

| 写法 | 说明 |
|------|------|
| `formDef.value` 为 **已编译** 原生 JSON | 短表单或从 Quicker 拉回的结构；patch 时原样提交 |
| `formDef.value` 为 **qkrpc.form.v1** 对象/字符串 | apply/patch 时编译为原生 `value`（仍不写回磁盘） |
| 遗留 `formSpec` | 仍支持，会编译为 `formDef`；新动作请用 `formDef.file` |

**勿**在已有 `formDef.file` 时再写 `formSpec`（二者互斥）。**勿**在 `data.json` 里手写 PascalCase 原生 `formDef.value` 代替 `.form.json` 文件。

## FormSpec 形状（qkrpc.form.v1）

```json
{
  "$schema": "qkrpc.form.v1",
  "mode": "variables",
  "title": "填写信息",
  "dictVar": "data",
  "fields": [
    {
      "key": "userName",
      "label": "姓名",
      "type": "text",
      "target": "userName",
      "required": true,
      "default": ""
    }
  ],
  "options": {
    "help": "请完整填写",
    "windowWidth": 520
  }
}
```

| 字段 | 说明 |
|------|------|
| `mode` | `variables`（编辑动作变量）或 `dict_dynamic`（编辑词典变量） |
| `title` | 表单窗口标题 |
| `dictVar` | `dict_dynamic` 时必填，词典变量 key |
| `fields[]` | 字段列表，至少 1 项 |
| `options` | 可选，映射到 `sys:form` 的 help / windowWidth 等参数 |

## 字段规则

| 属性 | 约束 |
|------|------|
| `key` | 唯一；`^[A-Za-z_][A-Za-z0-9_]{0,63}$` |
| `label` | 必填，1–80 字符 |
| `type` | `text` · `textarea` · `number` · `integer` · `boolean` · `select` · `dateTime` · `password` |
| `target` | 写入变量/词典键；默认等于 `key` |
| `options` | 仅 `select`；`value` 唯一 |
| `min` / `max` | 仅 `number` / `integer` |
| `pattern` | 仅 text-like；须为合法正则 |
| `visibleWhen` | `{ "field": "otherKey", "eq": "x" }` 或 `{ "ne": "x" }`（二选一） |

## 往返（可逆）

```text
编辑: data.json formDef.file + files/*.form.json (qkrpc.form.v1)
  → apply/patch: 编译为原生 formDef.value 写入 Quicker（磁盘不变）
  → get/extract: 原生 formDef → 反编译回 qkrpc.form.v1 + formDef.file
```

复杂 `VisibleExpression` 等无法无损还原时，extract 会打 warning 并省略对应字段属性。

## 编译结果（仅发往 Quicker 的内存副本）

| mode | 参数 |
|------|------|
| `variables` | `formDef.value` = 原生 `{ "fields": [...] }` JSON |
| `dict_dynamic` | `dynamicFormForDictDef.value` + `dictVar.varKey` |

原生字段使用 Quicker `FormField` 属性名（PascalCase）：`FieldKey`、`Label`、`InputMethod`、`SelectionItems` 等。

## 相关

`step-runner get sys:form` · `action-steps` · `workspace-editing` · `authoring-workflow`

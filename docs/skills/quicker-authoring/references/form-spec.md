# 多字段表单

**何时读**：在 `data.json` 里编写 **`sys:form`** 步骤的表单定义。表单 spec 通常是**长 JSON** — workspace **默认**用 **`formDef.file`**（或 `dynamicFormForDictDef.file`）指向 **`files/*.form.json`**，正文为 **`qkrpc.form.v1`**。**不要**在 `data.json` 里长期内联大段 `formDef.value`（也不要手写 Quicker 原生 PascalCase `FieldKey` JSON）。

## `data.json` 中的步骤

**默认形状**（与 **`action-project-files`**、**`action-steps`** 长参数外置一致）：

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

`files/login.form.json` 内容为 **`qkrpc.form.v1`**（见下文）。步骤上已写的 `title` / `operation` / `dictVar` 优先于 spec 内同名字段。

### `formDef` / `dynamicFormForDictDef`（默认 `file`）

`formDef` 参数对象与其它 `inputParams` 一样 **三选一**（`value` / `varKey` / `file`），但 **`sys:form` 几乎总是选 `file`** — spec 字段多、JSON 长，内联进 `data.json` 难维护。

| 形状 | 说明 |
|------|------|
| **`{ "file": "files/….form.json" }`** | **默认**；用 `workspace_action_file_write` / `file_edit` 维护正文，`data.json` 只保留路径 |
| `value` 内联 **qkrpc.form.v1** 对象或 JSON 字符串 | 仅极短表单；保存进 Quicker 前会编译为原生 `formDef.value` |
| `value` 为 **已编译** 原生 JSON | 多见于刚从 Quicker 导出、尚未反编译；**应**尽快转为 `formDef.file` + `.form.json` |
| 遗留 **`formSpec`** | 旧动作兼容；**新动作勿用**，改用 `formDef.file` |

**勿**在已有 `formDef.file` 时再写 `formSpec`。**勿**把大段表单 JSON 长期写在 `data.json` 的 `formDef.value` 里（用 `file` 外置）。

### 编译与磁盘

- 保存进 Quicker 时：`qkrpc.form.v1`（或 `formSpec`）→ 内存中的原生 **`formDef.value`** / **`dynamicFormForDictDef.value`**。
- **磁盘 `data.json` 保留 `formDef.file`**，不把编译后的原生 JSON 写回 `data.json`。
- 从 Quicker 拉回工作区时：原生 `formDef` 可 **反编译** 为 `files/*.form.json` 并写回 `formDef.file`（可逆；复杂 `VisibleExpression` 等可能无法无损还原）。

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

## 编译进 Quicker 后的参数

| mode | 目标 |
|------|------|
| `variables` | `formDef.value` = 原生 `{ "fields": [...] }` JSON |
| `dict_dynamic` | `dynamicFormForDictDef.value` + `dictVar` 绑定 |

原生字段使用 Quicker `FormField` 属性名（PascalCase）：`FieldKey`、`Label`、`InputMethod`、`SelectionItems` 等。

## 相关

`action-steps` · `action-project-files` · `step-runner-get` · `overview`

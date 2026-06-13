# 表单参数输入

> **场景**：弹窗收集多字段 → 写入动作变量 → 下游格式化/写剪贴板 · **难度**：M · **exemplar**：`__pattern_learning__form_param_input` patch ✅ · **trace**：UI 交互豁免（同 `form-to-clipboard` benchmark）

## 何时用

需要用户一次性填写多个参数（标题、选项、备注等），结果落到动作变量再进入表达式/剪贴板/HTTP 等流水线。与 **clipboard-pipeline** 的区别：输入来自 **sys:form** 而非剪贴板；与 **expression-first** 的区别：本模式显式弹窗收集。

## 步骤骨架

1. **声明变量** — `data.json` 中为每个 `FieldKey` / `target` 建 Text 变量（select 仍 Text）
2. **表单** — `sys:form` `operation: variables` + `formDef`（短）或 **`formDef.file`**（长）
3. **变换** — `sys:evalexpression` / `sys:formatString` 格式化为 Markdown 等
4. **输出** — `sys:writeClipboard` / `sys:showText` / `sys:http` …

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 表单字段 | 与 `FieldKey` 或 `target` 一致 | Text |
| 格式化结果 | `markdown` / `result` | Text |
| 表单成功 | `formOk` | Boolean |

## 示例动作

- 学习验证 `__pattern_learning__form_param_input`（`2063ba96-c200-42b6-b06f-bf72f8301d3d`）：form → evalexpression Markdown 任务清单 → writeClipboard
- SDK benchmark `form-to-clipboard`（`9441be78-…`）：需手动填表确认

Patch：`.local/patch-form-param-input.json`、spec：`.local/form-task.spec.json`

### 短表单（inline formDef）

用 `qkrpc form build --file spec.json --json` 得到 `step.inputParams.formDef` 内联 JSON。

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "operation": "variables",
    "title": "任务信息",
    "formDef": "{...native fields JSON...}",
    "windowWidth": "480",
    "stopIfFail": "True"
  },
  "outputParams": { "isSuccess": "formOk" }
}
```

### 长表单（formDef.file）

`files/*.form.json` 使用 `$schema: qkrpc.form.v1`；步骤写 `formDef.file`：

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "operation": "variables",
    "title": "任务信息",
    "formDef.file": "files/task.form.json"
  }
}
```

`qkrpc form validate --file files/task.form.json` 校验字段与 `target` 变量。

### 下游 Markdown（evalexpression）

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "{markdown} = \"## 任务\\n\\n\" + \"- **标题**: \" + ({title} ?? \"\") + \"\\n\" + \"- **优先级**: \" + ({priority} ?? \"中\") + \"\\n\" + \"- **标签**: \" + ({tags} ?? \"\") + \"\\n\" + \"- **备注**: \" + ({note} ?? \"\");"
  }
}
```

## 陷阱

- **FieldKey → 变量**：native `FieldKey` 必须对应 `data.json` 中已声明变量；`qkrpc.form.v1` 的 `target` 可映射到不同 key。
- **select**：spec 用 `options[]`；native 为 `SelectionItems: "value|label\\n..."`（`form build` 自动编译）。
- **长定义**：≥4 字段或含分组时用 **`formDef.file`**，勿塞巨大 inline `formDef`。
- **headless trace**：`sys:form` 阻塞 UI；自动化用 **mock 未覆盖** 时标 **trace-exempt**，手动跑 `--trace` 或设计器调试。
- **取消**：用户取消时 `isSuccess=false`；`stopIfFail: True` 会终止动作。
- **dict_dynamic**：编辑词典条目用 `operation: dict_dynamic` + `dictVar` + `dynamicFormForDictDef.file`（另见 form-spec）。

## 相关

form-spec · form build/validate · clipboard-pipeline · expression-first · skill：`quicker-authoring-form-param-input`

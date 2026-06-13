
# 表单参数输入（quicker-authoring-form-param-input）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/form-param-input.md`

## 何时加载

任务需要 **弹窗收集多字段** 写入动作变量，再格式化或写剪贴板/展示。对标 benchmark `form-to-clipboard`。

## 步骤骨架

1. `data.json` 声明与 `FieldKey`/`target` 一致的变量
2. `sys:form` `variables` + `formDef`（短）或 `formDef.file`（长，`qkrpc.form.v1`）
3. `sys:evalexpression` / `formatString` 组装输出
4. `writeClipboard` / `showText` 等收尾

## 硬规则

- 字段定义：`qkrpc form validate` / `form build`；长表单 **`formDef.file`**。
- `step-runner get --control-field variables` 查 wire 键。
- **headless trace 豁免**：form 需 UI；patch + validate 通过即可晋升，手动验证下游。
- select 选项在 spec 用 `options[]`，勿手写 native `SelectionItems` 除非已 `form build`。

## 深度阅读

- `action-patterns/form-param-input.md` · topic `form-spec` · step-modules `form`

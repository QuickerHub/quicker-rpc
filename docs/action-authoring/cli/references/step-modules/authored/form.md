# sys:form
<!-- qkrpc-search-aliases: 表单, form.json, formDef -->

> **分类**：界面交互 · **来源**：仓库手写 · **官方**：[form](https://getquicker.net/KC/Help/Doc/form)

**何时读**：通常不必读本 ref。字段定义、mode、校验 → **`form-spec`**（`qkrpc.form.v1` + `formDef.file`）；步骤键名 → `step-runner get`。

## 示例

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "operation": "variables",
    "title": "Settings",
    "formDef.file": "files/settings.form.json"
  }
}
```

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "operation": "dict_dynamic",
    "title": "Edit entry",
    "formDef.file": "files/dict-entry.form.json"
  }
}
```

## 相关

form-spec · step-runner-get · action-project-files

# sys:form

> **来源**：step JSON 示例 · **官方**：[form](https://getquicker.net/KC/Help/Doc/form)

**用途**：弹出表单收集变量或编辑词典条目（字段定义见 `form-spec` / `formDef.file`）。

## 示例

### 变量表单

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "operation": "variables",
    "title": "设置",
    "formDef.file": "files/settings.form.json"
  },
  "outputParams": {
    "isSuccess": "成功",
    "button": "按钮"
  }
}
```

### 动态词典表单

```json
{
  "stepRunnerKey": "sys:form",
  "inputParams": {
    "operation": "dict_dynamic",
    "dictVar": "配置",
    "title": "编辑条目",
    "dynamicFormForDictDef.file": "files/dict-entry.form.json"
  },
  "outputParams": {
    "isSuccess": "成功",
    "button": "按钮"
  }
}
```

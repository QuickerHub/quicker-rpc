| 标题 | topic | 何时读 |
|------|-------|--------|
| 动作步骤 | **`action-steps`** | P5–P6：`steps[]` 形状、`inputParams` / `outputParams`、条件分支 |
{{#only-agent}}| 动作变量 | **`action-variables`** | `variables[]` 类型、`quicker_in_param` 边界 |
{{/only-agent}}| 表达式与插值 | **`expressions`** | P4 **首选**：`$=`、`$$`、`sys:evalexpression` |
| 实现选型与回退 | **`implementation-fallback`** | P4：表达式不够或无模块时的回退 |
| 动作图标 | **`action-icons`** | P3：元数据 / 菜单项 `fa:` spec；须 `fa search` |
| 操作项文本语法 | **`common-operation-item`** | P3：右键菜单 `ContextMenuData` |
| 工作区目录与外置 | **`action-project-files`** | `.quicker/actions` 布局、`file` 引用形状 |
| 多字段表单 | **`form-spec`** | `sys:form` + `files/*.form.json` |
| WebView2 页面 | **`webview2-authoring`** | `sys:webview2` + `files/*.html`；Agent 侧 **`browser`** 右栏预览 |
| 动作内子程序 | **`action-embedded-subprograms`** | `subprograms/{subId}/` 磁盘模型 |

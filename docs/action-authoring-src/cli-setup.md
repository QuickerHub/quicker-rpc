# {{#ref cli-setup.title}}

## P0

{{#ref cli-setup.intro}}

{{#only-agent}}
指南写 **流程与领域规则**；参数以工具 description 为准。

| 工具 | 用途 |
|------|------|
| `docs_index` | 主题列表 |
| `docs_get` | 如 `overview`、`authoring-workflow`、`workspace-editing` |
| `docs_search` | 关键词检索 |
{{/only-agent}}

## 入口

{{#only-cli}}
```powershell
{{@ help}}
{{@doc overview}}
{{@doc authoring-workflow}}
```
{{/only-cli}}

## 专题

`overview` · `authoring-workflow`{{#only-agent}} · `workspace-editing` · `variables`{{/only-agent}} · `implementation-fallback` · `expressions` · `subprogram-workflow` · `step-runner-search` · `step-modules`{{#only-cli}} · `patch-workflow` · `action-project-files`{{/only-cli}}

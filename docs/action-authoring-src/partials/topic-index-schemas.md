| title | topic | when |
|-------|-------|------|
| Action steps | **`action-steps`** | P5–P6: steps[], inputParams/outputParams, branches |
{{#only-agent}}| Action variables | **`action-variables`** | variables[], quicker_in_param |
{{/only-agent}}| Expressions | **`expressions`** | P4 default: $=, $$, sys:evalexpression |
| Implementation fallback | **`implementation-fallback`** | P4 when no dedicated module |
| Action icons | **`action-icons`** | P3 metadata/menu fa: spec; fa search |
| Context menu items | **`common-operation-item`** | P3 ContextMenuData |
| Project files | **`action-project-files`** | .quicker/actions layout, file refs |
| Form spec | **`form-spec`** | sys:form + files/*.form.json |
| WebView2 | **`webview2-authoring`** | sys:webview2 + files/*.html |
| Embedded subprograms | **`action-embedded-subprograms`** | subprograms/{subId}/ disk model |

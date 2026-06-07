| 场景 | 对策 |
|------|------|
| `value` / 内联 `defaultValue` 含 `{var}` 却未以 `$$`/`$=` 开头 | 运行时不会展开；改为 `$$…` / `$=…` 或 `varKey`（**`expressions`**） |
| 猜 `inputParams` 键名 | 键名须与 step-runner schema 一致（**`step-runner-get`**） |
| 长脚本/字符串塞进 `value` | 超过约 4 行用 **`files/`** + `{ "file": "files/…" }`（**`action-steps`**、**`action-project-files`**） |
| `outputParams` 误用 input 形状 `{ "varKey": "…" }` | 应写 `"outputKey": "clipText"` 等 **字符串**（可 `dictVar.key`），见 **`action-steps`** |
| 使用废弃的 `defaultValueFile` | 改为 `defaultValue: { "file": "files/…" }`（**`action-variables`**） |
| 猜 `callIdentifier`、图标 spec | 须从子程序定义 / 图标目录取得，勿手写（**`subprogram-workflow`**、**`action-icons`**） |
{{#only-agent}}| 保存后反复 get 确认 | 以 patch / 编辑响应中的 **`editVersion`** 为准（**`authoring-workflow`** P7） |
| 传内联 patch JSON / `--patch-file` | Agent 用 **`workspace_program edit_data`** 改磁盘 **`data.json`** 后 **`workspace_program patch`**（**`workspace-editing`**） |
{{/only-agent}}
{{#only-cli}}| 保存后反复 get 确认 | 以 patch / apply 响应中的 **`editVersion`** 为准（**`authoring-workflow`** P7） |
{{/only-cli}}

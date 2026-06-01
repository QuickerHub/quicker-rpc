# Step runner search
**`step-modules`** 无匹配时用。一次查询带齐 OR/通配即可。
{{#only-cli}}
```powershell
{{@ step-runner.search}}
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ step-runner.search}}
```
{{/only-agent}}
→ `items[].key` → {{#ref step-runner.get.invoke}}。若 `items[]` 含 **`controlFieldKey` / `controlFieldValue`**（命中控制字段选项），get 时带上 {{#ref control-field.get}}。
## 语法
| 特性 | 语法 |
|------|------|
| AND | 空格分隔 token 均需匹配 |
| OR | `a\|b\|c` |
| 通配 | `*clip*`、`sys:*` |
## 相关
`authoring-workflow`（P5）· `step-modules` · `implementation-fallback` · `overview`

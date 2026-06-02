# Step runner search
**`step-modules`** 无匹配时用。一次查询带齐 OR/通配即可。

```text
qkrpc_step_runner_search({ query: "剪贴板|clipboard|sys:*clip*" })
```

→ `items[].key` → **`qkrpc_step_runner_get`**。若 `items[]` 含 **`controlFieldKey` / `controlFieldValue`**（命中控制字段选项），get 时带上 **`controlField`**。
## 语法
| 特性 | 语法 |
|------|------|
| AND | 空格分隔 token 均需匹配 |
| OR | `a\|b\|c` |
| 通配 | `*clip*`、`sys:*` |
## 相关
`authoring-workflow`（P5）· `step-modules` · `implementation-fallback` · `overview`

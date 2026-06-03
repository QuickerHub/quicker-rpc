# Step runner 搜索

**何时读**：**`overview`** P5 — **`step-modules`** 无匹配时。一次查询带上 OR/通配即可。

```text
qkrpc_step_runner_search({ query: "剪贴板|clipboard|sys:*clip*" })
```

用 `items[].key` 做 **`qkrpc_step_runner_get`**。若项含 **`controlFieldKey` / `controlFieldValue`**，get 时须传 **`controlField`**。

## 语法

| 特性 | 写法 |
|------|------|
| AND | 空格分隔，均需匹配 |
| OR | `a\|b\|c` |
| 通配 | `*clip*`、`sys:*` |

## 相关

`authoring-workflow`（P5）· `step-modules` · `implementation-fallback` · `overview`

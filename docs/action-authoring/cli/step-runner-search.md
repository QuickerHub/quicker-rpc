# Step runner 搜索

**何时读**：**`overview`** P5 — **`step-modules`** 无匹配时。一次查询带上 OR/通配即可。

```powershell
qkrpc step-runner search --query "剪贴板|clipboard|sys:*clip*" --json
```

用 `items[].key` 做 **`step-runner get`**。若项含 **`controlField`**（`{ key, value, name? }`），get 时须传 **`--control-field <value>`**（与 `controlField.value` 一致）。

结果按 **匹配分 + 加权分** 降序：

- **匹配分**：`ModuleScore`（key/keywords/name）+ `ControlScore`（每个 control 选项单独算，取最高）
- **加权分**（[`step-runner-agent-keywords.json`](../../QuickerRpc.AgentModel/Catalog/step-runner-agent-keywords.json)）：`rankBias` 压低/抬高整个模块；`controlRankBias` 按选项 `value` 调整（选中项计入 `TotalScore`）

`snippet` 来自关键词表。负 `rankBias` 可把不常推荐给 Agent 的模块排到后面（仍会出现在结果里）。

## 语法

| 特性 | 写法 |
|------|------|
| AND | 空格分隔，均需匹配 |
| OR | `a\|b\|c` |
| 通配 | `*clip*`、`sys:*` |

计算/LINQ/字符串逻辑 **优先 `sys:evalexpression`**（见 **`implementation-fallback`**）；search 仍返回专用模块，由 Agent 结合 `snippet` 选型。

## 相关

`authoring-workflow`（P5）· `step-modules` · `implementation-fallback` · `overview`

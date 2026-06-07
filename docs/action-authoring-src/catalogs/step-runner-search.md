# {{#topic-title}}

**何时读**：**`overview`** P5 — 为步骤选 `stepRunnerKey` 时。一次查询带上 OR/通配即可。

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

**非空 `query`**：带控制项枚举的命中模块，**必定**在对应 `items[]` 上返回 **`controlField`**（`{ key, value, name? }`）——已为该关键词选好默认子模式；无控制项的模块不带此字段。**空 `query`**：所有项均不带 `controlField`（仅浏览目录）。

**OR 组合 query**（含 `|`）：同一模块若多个 control 选项分别命中不同分支，除 **`controlField`**（最高分）外还会返回 **`controlFields`** 数组（全部命中项，best first）。Agent 按分支选用对应 `value` 再 get。

用 `items[].key` 做 {{#ref step-runner.get.invoke}}（**Agent 专用**，压缩 JSON、无 `icon`）。**action-editor UI** 用 `qkrpc step-runner get-ui`（含 `icon` 与完整 control 选项）。有 **`controlField`** 时，get **必须**传 {{#ref control-field.get}} = **`controlField.value`**（多分支时从 **`controlFields`** 取对应项）；**禁止**猜其它 control 值。多数场景 **search 一次即可定 key + control**。

结果按 **匹配分 + 加权分** 降序：

- **匹配分**：`ModuleScore`（key/keywords/name）+ `ControlScore`（每个 control 选项单独算，取最高）
- **加权分**（[`step-runner-agent-keywords.json`](../../QuickerRpc.AgentModel/Catalog/step-runner-agent-keywords.json)）：`rankBias` 压低/抬高整个模块；`controlRankBias` 按选项 `value` 调整；`controlKeywords` 为每个 control 选项独立检索词（模块 `keywords` 保持通用）

`snippet` 来自关键词表。负 `rankBias` 可把不常推荐给 Agent 的模块排到后面（仍会出现在结果里）。

**维护者**：在 [`step-runner-agent-keywords.json`](../../QuickerRpc.AgentModel/Catalog/step-runner-agent-keywords.json) 标注 **`obsolete: true`**（整模块不出现在 search，含空 query 浏览）或 **`obsoleteControlValues`**（该 control 选项不参与匹配/排序，search 不会选中该 `value`）。**`step-runner get` 不受影响**（仍可取 schema）。查询词命中 **`notFor`** 标签时也会隐藏整模块（按查询排除，非永久下架）。

## 语法

| 特性 | 写法 |
|------|------|
| AND | 空格分隔，均需匹配 |
| OR | `a\|b\|c` |
| 通配 | `*clip*`、`sys:*` |

计算/LINQ/字符串逻辑 **优先 `sys:evalexpression`**（见 **`implementation-fallback`**）；search 仍返回专用模块，由 Agent 结合 `snippet` 选型。

## 相关

`step-runner-get` · `authoring-workflow`（P5）· `implementation-fallback` · `overview`

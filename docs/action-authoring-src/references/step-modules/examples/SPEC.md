# step-modules examples 规范

> **路径**：`references/step-modules/examples/<id>.md`  
> **读者**：Agent 写步骤时查 JSON 示例；参数键名仍以 `qkrpc_step-runner get` 为准。

## 定位

| 目录 | 内容 |
|------|------|
| `kc/` | KC 官方全文（搜索/人工核对） |
| `authored/` | 仓库手写补充（wire 陷阱等，可选） |
| **`examples/`** | **仅** 压缩 step JSON 示例 |

每模块三目录互不替代；`docs_get_reference({ topic:"step-modules", file:"examples/<id>" })`。

## 文件结构

```markdown
# sys:<key>

> **来源**：step JSON 示例 · **官方**：[<slug>](<kc-url>)

**用途**：<一行>

## 示例

### <场景>
```json
{
  "stepRunnerKey": "sys:<key>",
  "inputParams": { … },
  "outputParams": { … }
}
```
```

## 规则

- 键名与 `step-runner get` 一致；省略 schema 默认值。
- `$$` / `$=` / `.var` / `.file` 保留。
- **`$=` 须为合法 C# 表达式**（与 `kc/evalexpression.md` 一致）：文本长度用 `{变量}.Length`，列表元素个数用 `{列表}.Count`，空文本用 `String.IsNullOrWhiteSpace`；勿写 `len()` 等伪函数。布尔比较用 `&&` / `||` / `!`；`sys:compute` 的 `expression` 仍用 `and` / `or`（见 `kc/compute.md`）。复杂 LINQ / 多变量赋值优先 `sys:evalexpression` 示例，而非塞进 assign。
- 单模式 ≥2 例；多 `controlField` 每主分支 ≥1 例。
- 参考 `kc/<id>.md` 与 KC 官方场景；可合并 `authored/` 已有示例。
- 校验：`node scripts/compress-module-ref-examples.mjs`（扫描 `examples/`）。

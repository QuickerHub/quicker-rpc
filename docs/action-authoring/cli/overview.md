# Overview（动作编辑入口）

无头编辑 XAction：**`qkrpc`** + QuickerRpc 插件。命令表：qkrpc help --json。流程：**`authoring-workflow`**、**`overview`**。

## 文档怎么用

| 层级 | 内容 |
|------|------|
| **工具 description** | 参数名、返回值、字段约束（权威来源） |
| **流程文档（本目录）** | P0–P7 顺序、workspace 分工、表达式/变量等领域规则 |
| **CLI 专用** | `patch-workflow`、`action-project-files`（内联 JSON / extract·apply） |

**CLI 默认路径**：`action get` → `step-runner get` → `action patch --patch-file`（或 extract/apply 改磁盘）。

## 编辑链路（P0–P7）

```text
阶段  目的
────  ─────────────────────────────────────────
 P0   Quicker + 插件 + 工作目录（Agent）
 P1   定位 actionId（create / list / search）
 P2   读取并同步工作区（get → .quicker/actions/{actionId}/）
 P3   元数据（可选：set-metadata）
 P4   实现选型（表达式 vs 专用步骤 vs C#）
 P5   每步：step-runner get（禁止猜 inputParams 键名）
 P6   编辑 data.json / files/ → 保存到 Quicker
 P7   以 patch 响应 editVersion / addedSteps 为准
```

**逐步操作**：**`authoring-workflow`**。

## 专题索引（按阶段）

| 主题 | 何时读 |
|------|--------|
| **`authoring-workflow`** | 按 P1–P7 执行（主流程） |
| **`implementation-fallback`** | P4：无合适步骤模块时怎么选 |
| **`expressions`** | `$=`、`$$`、evalexpression、Z.Expressions |
| **`subprogram-workflow`** | 公共子程序 vs 动作内子程序 |
| **`step-runner-search`** | P5：目录搜索 OR/通配 |
| **`step-modules`** | P5：常用 stepRunnerKey（大表 `docs_get_reference`） |
| **`patch-workflow`** | P6：内联 patch JSON |
| **`action-project-files`** | CLI 磁盘 extract/apply |
| **`cli-setup`** | P0、docs_index |

## 常见错误（由 qkrpc 返回说明）

| 场景 | 对策 |
|------|------|
| 猜 `inputParams` 键名 | **`step-runner get`** |
| 猜 `callIdentifier` | `qkrpc_subprogram_search` / `get` |
| 猜 icon | `qkrpc_fa_search` |
| patch 后反复 get 确认 | 用响应里的 `editVersion`、`addedSteps` |

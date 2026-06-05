# 总览

无头编辑 XAction：**`qkrpc`** + QuickerRpc 插件。命令表：qkrpc help --json。流程：**`authoring-workflow`**、**`overview`**。

## 文档怎么用

| 层级 | 内容 |
|------|------|
| **工具 description** | 参数名、返回值、字段约束（权威来源） |
| **流程文档（本目录）** | P0–P7 顺序、工具与工作区分工（`authoring-workflow`、`workspace-editing` 等） |
| **动作文件定义** | `action-variables`、`action-steps`、`expressions`、`action-project-files` — 仅 `data.json` / 目录结构，不涉及工具行为 |
| **CLI 专用** | `patch-workflow`（内联 patch JSON） |

**CLI 默认路径**：`action get` → `step-runner get` → `action patch --patch-file`（或 extract/apply 改磁盘）。

## P0 前置

Quicker 运行中且已加载 QuickerRpc 插件。终端直接 `qkrpc <子命令> --json`（命名管道，每次调用即可）。**`qkrpc serve` 仅 agent-gui** 持久 HTTP，普通 CLI/脚本无需常驻。

```powershell
qkrpc help --json
qkrpc guide get --topic authoring-workflow --json
```

## 编辑链路（P0–P7）

```text
阶段  目的
────  ─────────────────────────────────────────
 P0   Quicker + 插件（见上文「P0 前置」）
 P1   定位 actionId（create / list / search）
 P2   读取并同步工作区（get → .quicker/actions/{actionId}/）
 P3   元数据（可选：set-metadata）
 P4   实现选型（**表达式优先** → 专用步骤 → csscript）
 P5   每步：step-runner get（禁止猜 inputParams 键名）
 P6   编辑 data.json / files/ → 保存到 Quicker
 P7   保存后以 editVersion 为准（勿反复 get 确认）
```

**逐步操作**：**`authoring-workflow`**。

## 专题索引（按阶段）

| 标题 | topic | 何时读 |
|------|-------|--------|
| 写动作流程 | **`authoring-workflow`** | 按 P1–P7 执行（主流程） |
| 动作步骤 | **`action-steps`** | P5–P6：`steps[]` 形状、`inputParams` / `outputParams`、条件分支 |
| 表达式与插值 | **`expressions`** | P4 **首选**：`$=`、`$$`、`sys:evalexpression`（LINQ/字符串/多变量） |
| 实现选型与回退 | **`implementation-fallback`** | P4：表达式不够或无模块时的回退（csscript / runScript） |
| 子程序 | **`subprogram-workflow`** | 公共子程序 vs 动作内子程序 |
| 操作项文本语法 | **`common-operation-item`** | P3：动作右键菜单 `ContextMenuData`、`[图标]标题(提示)\|数据`、子菜单 |
| 步骤模块搜索 | **`step-runner-search`** | P5：目录搜索 OR/通配 |
| 步骤模块 schema | **`step-runner-get`** | P5：Agent 只用 `get`（禁止 `get-ui`）；与 search 分工 |
| 步骤模块用法 | **`step-modules`** | P4–P5：模块用途/模式/KC 摘要；`docs_get_reference` + `_catalog` |
| 工作区目录与外置 | **`action-project-files`** | `.quicker/actions` 布局、`file` 引用形状 |
| Patch 工作流（CLI） | **`patch-workflow`** | P6：内联 patch JSON |

## 常见错误（由 qkrpc 返回说明）

| 场景 | 对策 |
|------|------|
| `value` / 内联 `defaultValue` 含 `{var}` 却未以 `$$`/`$=` 开头 | 运行时不会展开；改为 `$$…` / `$=…` 或 `varKey`（**`expressions`**） |
| 猜 `inputParams` 键名 | 键名须与 step-runner schema 一致（**`step-runner-get`**） |
| 长脚本/字符串塞进 `value` | 超过约 4 行用 **`files/`** + `{ "file": "files/…" }`（**`action-steps`**、**`action-project-files`**） |
| `outputParams` 误用 input 形状 `{ "varKey": "…" }` | 应写 `"outputKey": "clipText"` 等 **字符串**（可 `dictVar.key`），见 **`action-steps`** |
| 使用废弃的 `defaultValueFile` | 改为 `defaultValue: { "file": "files/…" }`（**`action-variables`**） |
| 猜 `callIdentifier`、图标 spec | 须从子程序定义 / 图标目录取得，勿手写（流程见 **`subprogram-workflow`**、**`action-icons`**） |

| 保存后反复 get 确认 | 以 patch / apply 响应中的 **`editVersion`** 为准（**`authoring-workflow`** P7） |

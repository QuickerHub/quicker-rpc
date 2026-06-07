# Agent 工具粒度：为什么「压缩 / 合并工具数量」是错误方向

> 面向 quicker-rpc / QuickerAgent 维护者与 agent 设计讨论。  
> 结论先行：**不要为了少几个 tool definition 而把多个用户意图塞进一个 `action` 枚举工具。** 正确方向是 **按意图边界拆分工具 + 用 prompt 路由 + 按场景启用子集**，而不是继续合并。

---

## 1. 术语区分（避免讨论串线）

| 概念 | 含义 | 在本项目中的态度 |
|------|------|------------------|
| **工具合并 / 压缩** | 把多个 LLM 可见的 `tool` 合成一个，用 `action` / `mode` 等参数分支 | ❌ 对 QuickerAgent **错误方向**（本文主题） |
| **数据压缩** | `XActionCompressor`、step-runner schema 压缩、省略默认字面量 | ✅ 正确，减少 **tool result** token，与 tool 个数无关 |
| **上下文压缩** | `prepareCompressedContext` 摘要旧对话 | ✅ 正确，压缩 **messages**，不是 tools |
| **实现复用** | 多个 tool 共用 `executeQkrpcActionIdTool` 等 server 函数 | ✅ 正确，**代码**可合并，**LLM 接口**不应合并 |

后文「合并」均指第一行：**减少注册到模型的 tool 个数**。

---

## 2. 核心论点

### 2.1 选工具是分类问题，不是参数填空

模型每轮要先回答：**「现在该用哪一个能力？」**  
合并后变成：**「该用哪一个能力 + 填哪套互斥参数？」** —— 难度叠加，而不是相消。

QuickerAgent 域内意图差异大，例如：

- **只读搜索**（`qkrpc_action_query`）vs **执行**（`qkrpc_action_run`）vs **磁盘编辑**（`workspace_program`）
- **查 schema**（`qkrpc_step_runner_get`）vs **写步骤**（`workspace_program` patch）
- **危险删除**（需 UI Confirm）vs **普通写入**

这些不是「同一工具的不同参数」，而是 **不同安全边界、不同工作流、不同失败语义**。合并会迫使模型在一条 description 里消化全部互斥规则，实测表现为：选错 `action`、混用 `get` 与 `run`、对 body 误用 `qkrpc_action replace`。

### 2.2 工具 description 是 prompt 的一部分

`docs/agent-gui-prompt-structure.md` 已说明：system 只列工具族，**参数细节在 `tool.description` / `inputSchema`**。

每合并一个工具：

- 单条 description 变长，**每轮都占 context**（工具定义通常每轮重发）
- 互斥字段只能写「NOT xxx — use yyy」，模型仍可能违反
- UI 工具卡片、审批、测试回放都失去 **稳定 tool id**

**减 tool 个数 ≠ 减 token。** 往往只是把 token 从「多条短 schema」搬到「一条长 schema + system 里重复的 routing 表」。

### 2.3 权限与产品边界需要独立 tool id

`agent-gui/lib/tool-registry.ts` 按 **read / write / destructive** 分组；删除类单独注册且 `needsApproval`。

若合并为 `qkrpc_action({ action: "delete" })`：

- 用户无法单独关闭「运行」而保留「搜索」
- Launcher 模式无法干净排除 authoring 域（见 `LAUNCHER_TOOL_IDS`）
- 工具测试、telemetry、replay 无法按意图统计

**粒度是产品能力，不是实现细节。**

### 2.4 JSON Schema / 提供商约束

合并工具常走向 `z.discriminatedUnion("action", [...])`。本仓库已明确规避：

```80:81:agent-gui/lib/qkrpc-action-tool.server.ts
/** Strict parse schema (not sent to LLM — discriminatedUnion → JSON Schema type null on some providers). */
const actionIdInputSchema = z.discriminatedUnion("action", [
```

对外发给 LLM 的必须是 **flat `ZodObject`**（见 `qkrpc-action-tool.test.ts`）。  
合并越多意图 → flat schema 越大（所有 action 的字段并集）→ **参数幻觉**（给 `get` 填 `publish` 字段）越严重。

### 2.5 本仓库已经历「合并 → 再拆分」

| 阶段 | 形态 | 问题 |
|------|------|------|
| 早期 | `qkrpc_action_get`、`qkrpc_action_run`、`qkrpc_action_list`… 各一个 tool | tool 过多，但 **意图清晰** |
| 中期 | 合并为 `qkrpc_action({ action })`、`docs({ action })`、`quicker_settings({ action })` | 个数下降，routing 成本上升 |
| **当前** | 动作域 **拆回 5 个 registry tool**：`query` / `run` / `create` / `manage` / `qkrpc_action`（id 类） | 刻意把 **run** 从 `qkrpc_action` 独立（见 `tool-routing.ts`） |

`legacy-tool-aliases.ts` 保留 40+ 旧 id 仅供 replay，**新会话不再注册**。  
这说明团队结论不是「越少越好」，而是 **按意图边界找到最小可理解单元**。

仍保持 **不合并** 的范例：

- `qkrpc_step_runner_search` 与 `qkrpc_step_runner_get` **必须两步**（AGENTS.md Hard rules）
- `qkrpc_action_delete` / `qkrpc_subprogram_delete` 独立且需确认
- `workspace_program` 与 `qkrpc_action` **刻意分离**（disk edit vs Quicker 同步）

---

## 3. 外部调研（简要）

业界没有「tool 越少越好」的共识，而是 **粒度与意图对齐**：

1. **过粗工具**（多意图 + 多参数）会降低正确率。AWS Prescriptive Guidance 建议：单工具参数过多（>8）或覆盖多个 distinct intent 时应 **分解**（[Tool scope - MCP strategies](https://docs.aws.amazon.com/prescriptive-guidance/latest/mcp-strategies/mcp-tool-strategy-scope.html)）。
2. **过细工具**（一 API 一 tool）会增加编排步数；适合 **确定性流水线**，不适合 QuickerAgent 这种 **多域、多模式** 助手。
3. **BridgeScope**（CIDR 2026）在 LLM–数据库场景实证：**细粒度 tool** 在 SQL 执行、事务、安全控制上优于单一 `execute_sql` —— 因为 **选择更简单、约束更透明**。
4. **Task-aware tool filtering**（arXiv:2410.22457）：与其把 50 个 API 塞进 5 个 mega tool，不如 **按任务只暴露相关 tool 子集**。

对 QuickerAgent 的映射：

| 常见建议 | 本项目对应 |
|----------|------------|
| 按 user story 合并 3+ 连续 API | ❌ 不适用：P1–P7 是 **有分支的状态机**，不是固定脚本 |
| 限制参数个数 | ✅ 拆分 `run`、拆分 `create`、step-runner 两步 |
| 语义过滤 / 子集 | ✅ Launcher 固定 `LAUNCHER_TOOL_IDS`；用户 UI 勾选 |
| 确定性逻辑放代码 | ✅ `execute*` 复用；LLM 只见稳定 intent tool |

---

## 4. 合并工具的典型失败模式（本项目真实案例）

| 失败 | 表现 | 正确边界 |
|------|------|----------|
| run 并入 `qkrpc_action` | 编辑流程误 `run`；或该 debug 时用 `get` | 独立 `qkrpc_action_run` |
| list/search 留在 write tool | 纯查询走写权限通道 | 独立 `qkrpc_action_query` |
| body 编辑走 RPC replace | 绕过 workspace、`editVersion` 混乱 | `workspace_program` only |
| step-runner 一步搞定 | 猜 `inputParams` wire 键 | `search → get` 两步 |
| `docs_get` + `docs_search` + … | 4 个 tool → 1 个 `docs` | 可接受 **只读同域** 合并；但仍靠 `action` enum，需 flat schema |
| workspace 10+ file/data 操作合并 | 已实现为 **一个** `workspace_program` | **域内**合并：同一 target + 同一 editVersion 语义；不再并 action/subprogram |

注意：`workspace_program` 是 **域内聚合**（同一磁盘项目、同一 patch 语义），不是跨域 mega tool。继续把 `workspace_program` 与 `qkrpc_action` 合并会重新引入 body 编辑路径混乱。

---

## 5. 正确方向：不合并，而是分层减负

### 5.1 Prompt 路由，而不是 tool 路由参数

`agent-gui/lib/tool-routing.ts`：

> **one row per intent, not per tool**

意图 → tool 的映射放在 **system 短表**，每个 tool 保持 **窄 schema + 窄 description**。  
新增能力时：**加一行 routing + 必要时加新 tool**，而不是给 mega tool 加第 N 个 `action`。

### 5.2 按场景启用子集（减认知，不减表达力）

| 机制 | 作用 |
|------|------|
| `LAUNCHER_TOOL_IDS` | 启动器排除 `workspace_program`、`step_runner_*`、dev/llm |
| 工具勾选 UI | 用户关闭 destructive / browser 等 |
| Authoring skill tier0 | 只路由编写子集，不把所有 CLI 塞进一个 tool |
| `docs get` 按需 | 深文档进 tool result，不堆进 system |

这比「把 22 个 tool 合成 8 个」更有效：**模型看见的 tool 列表更相关**，且每个 tool 仍然好选。

### 5.3 压缩别处

- **Tool result**：RPC JSON 格式化、`returnMode: structure|metadata`、step-runner compressed schema
- **对话历史**：`context-compression.ts`
- **Authoring 文档**：tier0 热路由 + topic index，禁止 session 开头批量 `docs get`

### 5.4 实现层随意 DRY

`legacy-tool-aliases.ts`、`executeQkrpcActionIdTool`、`runQkrpcForTool` 等说明：**server 代码可以高度复用**；限制的是 **注册到 `quickerTools` 的 LLM 可见 id 个数与边界**。

---

## 6. 当前工具边界（维护参考）

截至本文，registry **动作域已拆为 16+ 个独立 tool**（另加 `set_thread_title` 等 internal）。  
**动作域（已拆分，不再使用 `action` enum）**：

```
qkrpc_action_query        — 只读搜索
qkrpc_action_get          — 同步到工作区
qkrpc_action_edit         — Quicker UI
qkrpc_action_edit_var     — 单变量
qkrpc_action_set_metadata — 标题/图标
qkrpc_action_move         — 网格移动
qkrpc_action_publish      — 分享
qkrpc_action_run          — 执行
qkrpc_action_debug        — 逐步调试
qkrpc_action_float        — 悬浮窗
qkrpc_action_create       — bootstrap info.json
qkrpc_profile_* / qkrpc_process_ensure — 布局
qkrpc_action_delete       — destructive，独立
```

合并时代的 `qkrpc_action` / `qkrpc_action_manage` / `qkrpc_action_run({ action })` 仅保留在 `legacy-tool-aliases.ts` 供 replay。

**子程序域（已拆分）**：`query` / `get` / `export` / `import` / `edit` / `create` / `delete`；改变量走 `workspace_program`（`edit_var` 已隐藏，仅 legacy replay）  
**编写域**：`workspace_program` + `step_runner_search` + `step_runner_get`（三步链：search → get → patch）  
**指南**：`docs`（只读 enum，不再拆）  
**设置**：`quicker_settings`（enum，但不含动作/程序编辑）

### 何时可以合并（窄条件）

仅当 **同时满足**：

1. **同一权限组**（如都只读）
2. **同一失败语义与副作用**
3. **参数集互斥且 flat schema 仍 < ~8 个有效字段**
4. **不会与相邻 intent 混淆**（routing 表无法单独一行解决时，反而应拆分）

否则 **新增 tool** 或 **加强 routing 行**，不要合并。

### 何时必须拆分

- 用户 / Launcher 需要 **独立开关**
- 需要 **Confirm / approval** 或 destructive 标记
- description 里不得不写 **「NOT xxx — use yyy」** 超过 2 次
- 测试与 UI 需要 **稳定 tool 名**（如 `qkrpc_action_run` vs `get`）
- 分属 **不同工作流阶段**（P5 search vs P6 patch）

---

## 7. 反模式清单（评审用）

在 PR / 设计评审中，以下主张应 **直接驳回**：

1. 「tool 太多，把 action 相关合成一个 `qkrpc_action`」—— 已回退过，run/create/query 必须独立。
2. 「step-runner search+get 合并成一个」—— 违反 Hard rules，必然猜参。
3. 「workspace 和 RPC 合成一个编辑工具」—— body 路径冲突。
4. 「delete 用 action enum 就行」—— 审批与勾选无法做。
5. 「tool 数要 <10，否则模型不能用」—— 应做 **mode 子集** 与 **result 压缩**，不是盲目合并。
6. 「CLI 子命令少，所以 agent tool 也要一一对应合并」—— CLI 面向人类脚本；agent 面向 **意图分类**，粒度不必同构。

---

## 8. 相关文件

| 路径 | 说明 |
|------|------|
| `agent-gui/lib/tool-registry.ts` | UI 分组、legacy 迁移、CONSOLIDATED_* 仅用于 prefs 迁移 |
| `agent-gui/lib/tool-routing.ts` | System 意图路由表 |
| `agent-gui/lib/legacy-tool-aliases.ts` | 已合并时代的 40+ tool（仅 replay） |
| `agent-gui/lib/qkrpc-action-tool.server.ts` | flat schema vs discriminatedUnion 分流 |
| `docs/agent-gui-prompt-structure.md` | Prompt 分层；工具描述是 prompt 延伸 |
| `AGENTS.md` | step-runner 分工、workspace_program 唯一 patch 路径 |

---

## 9. 总结

**压缩工具数量 / 合并 mega tool 是错误方向**，因为：

1. 把 **tool selection** 和 **parameter filling** 耦合成更难的一步  
2. 膨胀单条 schema/description，**总 token 未必下降**  
3. 破坏权限、审批、Launcher 子集、可观测性  
4. 与 QuickerAgent **已验证的拆分**（action run、step-runner 两步、workspace 分离）相悖  

**正确做法**：保持 **意图级 tool 边界** → system **routing 表** → **场景子集** → **压缩 tool result 与对话历史** → **实现层复用**。

若未来 tool 列表继续增长，优先 **按 chatMode / 任务类型做 semantic filter**，而不是 **把 registry 砍半**。

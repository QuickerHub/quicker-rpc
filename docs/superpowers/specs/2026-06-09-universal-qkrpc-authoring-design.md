# 通用 qkrpc 写动作能力 — 单 MCP 设计

> 状态：草案 v2（工具名与 QuickerAgent registry 对齐）  
> 日期：2026-06-09  
> 目标宿主：**Cursor、Claude Code、Codex**（均可；优先 **一个 MCP server** 搞定）  
> 前置：`qkrpc agent setup`（[2026-06-08-qkrpc-agent-setup-design.md](2026-06-08-qkrpc-agent-setup-design.md)）已完成 Phase 1–3

---

## 1. 目标与成功标准

### 1.1 用户目标

在 **不安装 QuickerAgent** 的前提下，第三方 Agent 通过 **`qkrpc mcp` 一个 stdio MCP** + **通用 skills**，获得与 QuickerAgent **接近一致** 的无头写动作体验（P1–P7）。

### 1.2 成功标准（可验收）

| 级别 | 标准 |
|------|------|
| **L1 工作流** | 新建动作 → 拉取/编辑磁盘 → 保存 → 运行/调试；step-runner 两步；不猜 `inputParams` |
| **L2 工具语义** | 磁盘编辑走 **MCP 结构化工具**（非依赖宿主 `Read/Write`）；`patch` 后 `diagnostics` |
| **L3 产品** | 步骤设计器 UI、浏览器、审批流 — **明确不做** |

### 1.3 非目标

- 不把 QuickerAgent **专有**工具搬进 MCP（`browser`、`shell_exec`、`web_search`、`llm_settings`、`launcher_resolve`、`dev_frontend_check`、`ask_question`）
- 不做 Cursor Marketplace 远程 skill registry（仍用 `agent setup` 复制）
- 不做 VS Code 扩展 / Codex 插件（仅 MCP + 可选项目 `mcp.json` / `config.toml` 片段）

### 1.4 设计约束（v2，用户确认）

**MCP 工具 id 与参数结构必须与 QuickerAgent `QKRPC_TOOL_REGISTRY` + 各 `*-tool.server.ts` flat schema 一致** — 同一意图、同一名称、同一字段集；skills / `tool-routing.ts` / `quicker-authoring` **无需分叉工具名**。

---

## 2. 核心结论：一个 MCP + 与 QuickerAgent 同构的工具面

```
┌─────────────────────────────────────────────────────────────┐
│  qkrpc.exe  mcp  (stdio, 单进程单协议)                        │
│  • ~30 个 authoring 工具（与 registry 同名、同 schema）         │
│  • env: QKRPC_WORKSPACE_ROOT, QKRPC_SETUP_VERSION           │
└───────────────────────────┬─────────────────────────────────┘
                            │ 同一 server 定义
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
     Cursor            Claude Code            Codex
  ~/.cursor/mcp.json   claude mcp / .mcp.json  codex mcp / mcp.json
        │                   │                   │
        └───────────────────┴───────────────────┘
                            │
              docs/skills/* (宿主中立, agent setup 复制)
              docs/agent-rules/* (Cursor rules 可选)
              ~/.claude/CLAUDE.md 段 (Claude Code)
```

**原则**：

1. **一个 MCP server**（`qkrpc mcp`），所有宿主同一配置块。
2. **工具名 = QuickerAgent registry id**（见 §5.1）；**禁止** MCP 专用别名（如 `qkrpc_workspace`、`qkrpc_action` mega tool）。
3. **skills 单源**：`quicker-authoring` 直接引用 registry 工具名，**不再**维护 `quicker-authoring-mcp` 分叉。

---

## 3. 现状差距

| 问题 | 影响 |
|------|------|
| MCP 使用 `qkrpc_action` / `qkrpc_subprogram` mega tool（`action` enum） | 与 QuickerAgent 已拆分的意图级工具不一致；违反 `agent-tool-granularity.md` |
| MCP 使用 `qkrpc_sync` 而非 `workspace_program` | 磁盘编辑路径、参数、routing 表全部错位 |
| MCP 使用 `docs_index` / `docs_get` / `docs_search` 三个 tool | QuickerAgent 为单一 `docs`（`action`: index \| search \| get） |
| 缺少 `workspace_program`、`workspace_file` 等 | 无法复用 `workspace-editing.md` / P6 文档 |
| Codex 未纳入 `agent setup` | 需手配 |

---

## 4. 方案选定（v2）

| 层级 | 决策 |
|------|------|
| **MCP 工具 id** | 与 `agent-gui/lib/tool-registry.ts` **编写域子集** 1:1 对齐（§5.1） |
| **MCP 参数 schema** | 与各 `*-tool.server.ts` 发给 LLM 的 **flat ZodObject** 对齐（§5.2） |
| **Mega tool** | **移除** `qkrpc_action`、`qkrpc_subprogram`；短期可提供 **legacy 别名**（同 handler，标记 deprecated） |
| **sync** | **移除** `qkrpc_sync`；由 `workspace_program` + `qkrpc_action_get` / `qkrpc_subprogram_get` 覆盖 |
| **docs** | **合并** 为 `docs` 单工具 |
| **Skills** | **统一** `quicker-authoring`（不再分叉 MCP 版） |
| **安装** | `agent setup` 支持 Cursor + Claude Code + Codex |

---

## 5. MCP 工具面（与 QuickerAgent registry 对齐）

### 5.1 工具清单（MCP 注册 id = registry id）

**连通**

| MCP id | QuickerAgent | 说明 |
|--------|--------------|------|
| `qkrpc_wait` | ✓ | 轮询等待插件；connectivity_failure 时用 |
| `qkrpc_health` | — | **可选保留**（一次 ping）；description 指向 `qkrpc_wait`；不进入 routing 表 |

**指南**

| MCP id | QuickerAgent |
|--------|--------------|
| `docs` | ✓（`action`: index \| search \| get） |

**工作区**

| MCP id | QuickerAgent |
|--------|--------------|
| `workspace_program` | ✓（`action`: projects_list \| read_data \| … \| patch \| diagnostics） |
| `workspace_file` | ✓（cwd 普通文件；**非** data.json 程序体） |

**动作域**

| MCP id | QuickerAgent |
|--------|--------------|
| `qkrpc_action_query` | ✓ |
| `qkrpc_action_get` | ✓ |
| `qkrpc_action_create` | ✓ |
| `qkrpc_action_edit` | ✓ |
| `qkrpc_action_edit_var` | ✓ |
| `qkrpc_action_set_metadata` | ✓ |
| `qkrpc_action_move` | ✓ |
| `qkrpc_action_publish` | ✓ |
| `qkrpc_action_run` | ✓ |
| `qkrpc_action_debug` | ✓ |
| `qkrpc_action_float` | ✓ |
| `qkrpc_action_delete` | ✓ |
| `qkrpc_profile_create` | ✓ |
| `qkrpc_profile_delete` | ✓ |
| `qkrpc_profile_prune` | ✓ |
| `qkrpc_profile_reorder` | ✓ |
| `qkrpc_process_ensure` | ✓ |

**子程序域**

| MCP id | QuickerAgent |
|--------|--------------|
| `qkrpc_subprogram_query` | ✓ |
| `qkrpc_subprogram_get` | ✓ |
| `qkrpc_subprogram_create` | ✓ |
| `qkrpc_subprogram_export` | ✓ |
| `qkrpc_subprogram_import` | ✓ |
| `qkrpc_subprogram_edit` | ✓ |
| `qkrpc_subprogram_delete` | ✓ |

**目录 / 设置**

| MCP id | QuickerAgent |
|--------|--------------|
| `qkrpc_step_runner_search` | ✓ |
| `qkrpc_step_runner_get` | ✓ |
| `qkrpc_fa` | ✓ |
| `quicker_settings` | ✓（`action` enum，与现 MCP 一致） |

**不注册进 MCP（QuickerAgent 专有）**

`browser` · `shell_exec` · `web_search` · `dev_frontend_check` · `llm_settings` · `ask_question` · `launcher_resolve`

**高级 / 兼容（可选）**

| MCP id | 说明 |
|--------|------|
| `qkrpc_invoke` | 通用 serve op；**不写入** skill routing；供脚本与兜底 |
| `qkrpc_action` | legacy mega tool → 分发到上表各工具；**deprecated**，下个大版本移除 |
| `qkrpc_subprogram` | 同上 |
| `qkrpc_sync` | legacy → 映射 `workspace_program` / get；**deprecated** |
| `docs_get` 等 | legacy → `docs`；**deprecated** |

**工具数**：约 **32** 个正式工具 + 可选 legacy；仍 &lt; Windsurf 100 上限。

### 5.2 参数结构（必须与 QuickerAgent 一致）

| 工具 | schema 真源（实现须对齐） |
|------|---------------------------|
| `workspace_program` | `agent-gui/lib/workspace-program-tool.server.ts` → `WorkspaceProgramToolInput` |
| `workspace_file` | `agent-gui/lib/workspace-general-file-tool.server.ts` |
| `qkrpc_action_*` | `agent-gui/lib/qkrpc-action-tool.server.ts` 各 `*_TOOL_DEF` |
| `qkrpc_subprogram_*` | `agent-gui/lib/qkrpc-subprogram-tool.server.ts` |
| `docs` | `agent-gui/lib/docs-tool.server.ts` |
| `quicker_settings` | `agent-gui/lib/qkrpc-settings-tool.ts` |
| `qkrpc_step_runner_*` / `qkrpc_fa` | 现有 MCP 已与 CLI 对齐，对照 agent-gui 复核 description |

**硬规则（与 QuickerAgent 相同）**：

- 每个 MCP tool = **一个意图** + **flat JSON Schema**（禁止 `discriminatedUnion` 发给 MCP host）
- `workspace_program`：**禁止**对 `data.json` 用 `workspace_file` 或宿主 Read
- **禁止** RPC `patch`/`replace` 写程序体；body 仅 `workspace_program` → `patch`
- `qkrpc_action_run` 与 `qkrpc_action_debug` **独立**（不合并 enum）

### 5.3 Schema 单源策略（实现）

优先顺序：

1. **长期**：从 `agent-gui` Zod schema 导出 JSON Schema → MCP `[McpServerTool]` 代码生成或嵌入资源（`docs/action-authoring-src/manifest/tool-schemas.json`）。
2. **Phase 1**：C# 手写 flat 参数，与 `qkrpc-action-tool.test.ts` / `tool-registry.test.ts` 对照；**契约测试** `QuickerRpc.Test` 校验 MCP 暴露的 tool 列表与 registry 子集一致。
3. **执行层**：MCP handler 与 agent-gui **共用 serve op / RPC**（`InvokeOpAsync`、 `ActionProjectServeOps`）；禁止 MCP 单独实现业务逻辑。

### 5.4 实现布局

| 文件 | 职责 |
|------|------|
| `QuickerRpc.Console/Mcp/QkrpcMcpToolCatalog.cs` | 正式 tool id 列表 = registry 子集；供测试与文档生成 |
| `QuickerRpc.Console/Mcp/QkrpcMcpWorkspaceTools.cs` | `workspace_program`、`workspace_file` |
| `QuickerRpc.Console/Mcp/QkrpcMcpActionTools.cs` | 拆为 per-intent tools（替换 mega） |
| `QuickerRpc.Console/Mcp/QkrpcMcpSubprogramTools.cs` | 同上 |
| `QuickerRpc.Console/Mcp/QkrpcMcpDocsTools.cs` | 合并为 `docs` |
| `QuickerRpc.Console/Mcp/QkrpcMcpLegacyAliases.cs` | deprecated mega tools 转发 |

---

## 6. Skill 包（与 QuickerAgent 单源）

### 6.1 目录策略

工具名对齐后，**第三方与 QuickerAgent 共用同一套 skills**：

| Skill | `agent setup` 复制 | 说明 |
|-------|-------------------|------|
| `qkrpc` | ✓ | 连通性、安装；更新 MCP tool 列表指向 registry 名 |
| `quicker-authoring` | ✓ | **不再分叉**；`prompt-tier0` / `authoring-workflow` 已写 `workspace_program` |
| `quicker-run` | ✓ | `qkrpc_action_run` / `qkrpc_action_debug` |
| `quicker-rpc-knowledge` | ✓ | 术语与架构 |
| `quicker-sync` | **移除或 deprecated** | 由 `workspace_program` 替代；skill 内链到 `workspace-editing` |

QuickerAgent 额外从 `lib/agent-skills/` 加载 tier0；内容应与 `docs/skills/quicker-authoring/prompt-tier0.md` 同步。

### 6.2 Routing 表

**直接复用** `agent-gui/lib/tool-routing.ts`（`TOOL_ROUTING_TABLE`）— MCP 与 QuickerAgent **同一行、同一 tool id**。  
Rules（`qkrpc.mdc` / `CLAUDE.md`）嵌入该表或指向 `docs_get` topic `overview`。

### 6.3 Rules

- **Cursor**：继续 `qkrpc.mdc`（更新为 MCP routing + workspace 硬规则）
- **Claude Code**：`~/.claude/CLAUDE.md` merge（已有 `QkrpcAgentSetupGuidance`）
- **Codex**：项目 `AGENTS.md` 或 `.codex/` 片段模板（`agent setup --project` 写入）；内容 **与 `qkrpc.mdc` 同源**（从 `docs/agent-rules/` 生成）

**不为 Codex 单独维护业务规则** — 只维护 **一份** `docs/agent-rules/qkrpc-authoring.md` 模板，setup 时按宿主落盘。

---

## 7. 安装：`agent setup` 扩展

### 7.1 默认宿主集（本设计）

```powershell
qkrpc agent setup --workspace D:\quicker-projects
# 等价显式：
qkrpc agent setup --cursor --claude-code --codex --workspace ...
```

| 宿主 | 用户级配置 | 格式 |
|------|-----------|------|
| Cursor | `~/.cursor/mcp.json` | `mcpServers` |
| Claude Code | `claude mcp add` 或文档指引 + 项目 `.mcp.json` | `mcpServers` |
| Codex | `codex mcp add qkrpc --env QKRPC_WORKSPACE_ROOT=... -- <qkrpc.exe> mcp` | `~/.codex/config.toml` `[mcp_servers.qkrpc]` |

**Codex 实现注意**：

- 官方推荐 `codex mcp add`（写 `~/.codex/config.toml`）
- 项目级 `mcp.json` / `.codex/config.toml` 需 **trusted project**；`--project` 写入 `mcp.json`（与 Claude Code 共用形状）
- setup 应 **检测 `codex` 在 PATH**：有则 `codex mcp add`；无则打印一行手动命令

### 7.2 统一 MCP server 块

```json
{
  "command": "<resolved-qkrpc.exe>",
  "args": ["mcp"],
  "env": {
    "QKRPC_WORKSPACE_ROOT": "<workspace>",
    "QKRPC_SETUP_VERSION": "<cli-version>"
  }
}
```

Codex TOML 等价：

```toml
[mcp_servers.qkrpc]
command = "C:\\...\\qkrpc.exe"
args = ["mcp"]
enabled = true

[mcp_servers.qkrpc.env]
QKRPC_WORKSPACE_ROOT = "D:\\quicker-projects"
QKRPC_SETUP_VERSION = "0.12.x.x"
```

### 7.3 Skills 复制

`DefaultSkillNames`（与现网一致，去掉即将 deprecated 的 `quicker-sync`）：

```text
qkrpc
quicker-rpc-knowledge
quicker-authoring
quicker-run
```

---

## 8. P1–P7 标准路径（MCP = QuickerAgent 同工具名）

```text
P0  qkrpc_wait（可选先 qkrpc_health）
P1  qkrpc_action_create | qkrpc_action_query
P2  qkrpc_action_get / qkrpc_subprogram_get；workspace_program projects_list
P3  qkrpc_action_set_metadata + qkrpc_fa
P4  docs action=get topic=expressions / implementation-fallback
P5  qkrpc_step_runner_search → qkrpc_step_runner_get（每步）
P6  workspace_program read_data/edit_data, file_* → patch
P7  信任 editVersion；workspace_program diagnostics；禁止 verify re-get
```

运行：`qkrpc_action_run`；排查：`qkrpc_action_debug`。

---

## 9. 与 QuickerAgent 边界（对用户说明）

| 有 | 无（第三方 MCP） |
|----|------------------|
| P1–P7 无头编写 | 步骤可视化设计器 |
| step-runner 压缩 schema | `step-runner get-ui` |
| diagnostics/lint | 嵌入式 browser |
| publish/settings（MCP 已有） | destructive 内置审批 UI（靠模型+用户确认） |

---

## 10. 实现阶段

### Phase 1 — MCP 工具拆分与 workspace

- [ ] `QkrpcMcpToolCatalog.cs`：registry 子集常量 + 测试断言
- [ ] `workspace_program` + `workspace_file` MCP（对齐 `workspace-program-tool.server.ts`）
- [ ] 拆分 `qkrpc_action` → `qkrpc_action_query` … `qkrpc_process_ensure`
- [ ] 拆分 `qkrpc_subprogram` → `qkrpc_subprogram_*`
- [ ] 合并 `docs_*` → `docs`
- [ ] `QkrpcMcpLegacyAliases.cs`：旧 mega tool 转发 + stderr deprecated 警告

### Phase 2 — Schema 契约与文档

- [ ] `QuickerRpc.Test`：`McpToolCatalog_MatchesAgentRegistrySubset`
- [ ] 更新 `docs/skills/qkrpc/references/mcp-tools.md` = registry 表
- [ ] 更新 `docs/agent-mcp-integration.md`（工具列表、Codex）
- [ ] deprecate `quicker-sync` skill；`qkrpc.mdc` 嵌入 `TOOL_ROUTING_TABLE`

### Phase 3 — 安装

- [ ] `agent setup`：Codex `codex mcp add` / `config.toml`
- [ ] manifest `mcpToolSetVersion` 字段 + `--check` 提示升级

### Phase 4 — 质量

- [ ] MCP-only 评测（与 QuickerAgent 共用 `agent-test-prompts` 子集）
- [ ] 对比测试：同一 prompt 在 QuickerAgent vs Cursor MCP 工具调用序列一致

---

## 11. 测试计划

1. **工具面**：`qkrpc mcp` 暴露的 id 集合 ⊇ registry 编写子集；每个 id 与 agent-gui schema 字段名一致（契约测试）
2. **闭环**：`qkrpc_action_create` → `workspace_program` edit_data → patch → `qkrpc_action_run`
3. **Legacy**：旧会话若仍调 `qkrpc_action` action=get，转发到 `qkrpc_action_get` 且结果一致
4. **宿主**：Cursor / Claude Code / Codex 各连同一 `qkrpc mcp` 块

---

## 12. 开放问题

1. **Schema  codegen 时间表** — Phase 1 手写 C#，Phase 2 是否从 Zod 导出 JSON Schema
2. **Legacy mega tools 保留几个版本** — 建议 2 个 minor release 后移除
3. **Codex 用户级 vs 项目级** — 默认 `codex mcp add`；`--project` 写 `mcp.json`

---

## 13. 相关文档

- [agent-mcp-integration.md](../../agent-mcp-integration.md)
- [agent-tool-granularity.md](../../agent-tool-granularity.md)
- [agent-skill-distribution.md](../../agent-skill-distribution.md)
- [2026-06-08-qkrpc-agent-setup-design.md](2026-06-08-qkrpc-agent-setup-design.md)

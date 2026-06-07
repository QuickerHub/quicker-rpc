# qkrpc 跨 Agent 安装设计

> 状态：已确认（用户级默认、暂不做 VS Code 扩展）  
> 日期：2026-06-08  
> 目标场景：开发者在 Cursor / VS Code Copilot / Claude Code 中编写 Quicker 动作

---

## 1. 背景与目标

qkrpc 已具备 MCP stdio 服务（`qkrpc mcp`）与部分安装能力（`qkrpc mcp install`），以及 `quicker-authoring` skill（仅复制到 Cursor 用户目录）。缺口在于：

- 安装入口分散，skill / MCP / 终端 PATH 未形成统一产品面
- skill 仅覆盖 Cursor 用户级，且只有一个 authoring skill
- 无安装 manifest，无法检测配置是否过期
- 第三方 Agent 与 QuickerAgent 的能力边界未在安装时明确写入

**目标**：一条命令完成「本机 Agent 接入」，默认**用户级**；团队需要时再显式 `--project`。

**明确不做**（本阶段）：

- VS Code / Cursor **扩展插件**（marketplace extension）
- 把 QuickerAgent 全量 tool registry 搬进 MCP
- 非 Windows 平台的独立 MCP 发行包

---

## 2. 设计原则

1. **MCP = 能调用；Skills/Rules = 别乱猜** — 能力走 tool，工作流与 Hard rules 走 skill / rules 片段。
2. **MCP 工具按意图拆分** — 保持 ~16 个 MCP tool，不合并 mega tool（见 `docs/agent-tool-granularity.md`）。
3. **实现单源** — MCP handler 与 `qkrpc serve` 共用 op 层；skills 文档与 `docs_get` topics 同源。
4. **默认用户级** — 不污染用户仓库；`--project` 为 opt-in，供团队 commit。
5. **向后兼容** — `qkrpc mcp install` 保留为 `qkrpc agent setup` 的别名。

---

## 3. 架构

```
┌─────────────────────────────────────────────────────────┐
│ 能力核心                                                 │
│  qkrpc CLI ──► QuickerRpc Plugin (命名管道)              │
│  qkrpc serve (127.0.0.1:9477) — QuickerAgent / HTTP 集成 │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ Agent 适配层（本设计范围）                                │
│  • qkrpc mcp (stdio) — 16 个 MCP tools                   │
│  • Skills 包 — docs/skills/*                             │
│  • Rules 片段 — docs/agent-rules/*（生成到用户/项目目录） │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
     Cursor          VS Code Copilot      Claude Code
   (MCP+skills)      (MCP+instructions)   (MCP+CLAUDE.md)
```

---

## 4. 统一安装命令

### 4.1 命令形态

新增主命令 **`qkrpc agent setup`**；`qkrpc mcp install` 作为别名，行为一致。

```powershell
# 默认：用户级，Cursor MCP + quicker-authoring skill
qkrpc agent setup

# 所有已支持宿主的用户级 MCP
qkrpc agent setup --all

# 显式指定宿主
qkrpc agent setup --cursor --vscode --claude-code

# 额外写入项目级配置（团队 opt-in）
qkrpc agent setup --project --workspace D:\my-quicker-workspace

# 跳过 skill（仅 MCP + PATH）
qkrpc agent setup --skip-skill

# 检查本机配置是否与当前 CLI 版本匹配
qkrpc agent setup --check
```

### 4.2 默认行为（用户级）

在未传任何 flag 时：

| 步骤 | 动作 | 写入位置 |
|------|------|----------|
| MCP | 合并 `qkrpc` stdio server | `~/.cursor/mcp.json` |
| Skills | 复制 skill 家族 | `~/.cursor/skills/` |
| Rules | 写入 qkrpc 路由规则 | `~/.cursor/rules/qkrpc.mdc` |
| Manifest | 记录安装版本与宿主 | `~/.qkrpc/agent-setup.json` |
| Workspace | 若 cwd 有 `.quicker` 或显式 `--workspace`，bootstrap index | 工作区目录 |
| Terminal PATH | **不**默认改项目 `.vscode/settings.json` | — |

说明：用户级默认**不**修改当前目录下的 `.vscode/settings.json`，避免在任意 cwd 执行时污染仓库。需要项目终端 PATH 时使用 `--project` 或手动配置。

### 4.3 `--project`（opt-in）

显式传入时，在**当前目录**（或 `--workspace`）额外写入：

| 产物 | 路径 |
|------|------|
| Cursor MCP | `.cursor/mcp.json` |
| VS Code MCP | `.vscode/mcp.json` |
| Claude Code MCP | `.mcp.json` |
| 项目 skills | `.cursor/skills/`（可选 `--project-skills`） |
| 项目 rules | `.cursor/rules/qkrpc.mdc` |
| 终端 PATH | `.vscode/settings.json` |
| 工作区 manifest | `.qkrpc/agent-setup.json` |
| Bootstrap | `.quicker/README.md` + index |

团队可将 `.cursor/mcp.json`、`.vscode/mcp.json`、`.mcp.json`、`.cursor/rules/` commit 到仓库。

### 4.4 支持的宿主（MCP 配置）

沿用 `QkrpcMcpInstallTargets`：

| Flag | 用户级路径 | 配置格式 |
|------|-----------|----------|
| `--cursor`（默认） | `~/.cursor/mcp.json` | `mcpServers` |
| `--claude` | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| `--vscode` | VS Code User `mcp.json` | `servers` + `type: stdio` |
| `--windsurf` | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| `--cline` | Cline `cline_mcp_settings.json` | `mcpServers` |
| `--claude-code` | `~/.claude/` 或项目 `.mcp.json`（配合 `--project`） | `mcpServers` |
| `--all` | 上表全部用户级 | — |

MCP server 定义（两种格式共用字段）：

```json
{
  "command": "<resolved-qkrpc.exe>",
  "args": ["mcp"],
  "env": {
    "QKRPC_WORKSPACE_ROOT": "<workspace-or-cwd>",
    "QKRPC_SETUP_VERSION": "<cli-version>"
  }
}
```

---

## 5. Skill 包

### 5.1 Skill 家族

源码目录：`docs/skills/<name>/`，随 CLI 安装目录或 repo 解析（沿用 `ResolveSkillSource` 逻辑，扩展为多 skill）。

| Skill | 目录 | 触发场景 |
|-------|------|----------|
| `qkrpc` | `docs/skills/qkrpc/` | 任何 Quicker/qkrpc 任务：连通性、`qkrpc_wait`、MCP 优先于 shell |
| `quicker-authoring` | `docs/skills/quicker-authoring/` | 写/改动作、子程序、P0–P7 工作流 |
| `quicker-sync` | `docs/skills/quicker-sync/`（Phase 2） | pull/push `.quicker/` 工作区 |
| `quicker-run` | `docs/skills/quicker-run/`（Phase 2） | 仅执行/调试，不含编辑 |

Phase 1 至少交付 **`qkrpc`** + **`quicker-authoring`**。

### 5.2 安装位置

| 范围 | 路径 |
|------|------|
| 用户级（默认） | `~/.cursor/skills/<name>/` |
| 项目级（`--project --project-skills`） | `<workspace>/.cursor/skills/<name>/` |

### 5.3 与 MCP 工具对齐

`qkrpc` skill 须明确：

- 已配置 MCP 时优先 `qkrpc_health` / `qkrpc_*`，勿 shell 连环探活
- 连通失败用 `qkrpc_wait`
- 第三方 Agent **无** `workspace_program`；磁盘编辑走文件 + `qkrpc_sync`

`quicker-authoring` skill 保留 P0–P7 与 step-runner 两步 Hard rules；深文档走 `docs_get`，不粘贴全文。

### 5.4 非 Cursor 宿主的行为指导

无原生 skill 目录时，`agent setup` 写入等价片段：

| 宿主 | 用户级 | 项目级（`--project`） |
|------|--------|----------------------|
| Claude Code | `~/.claude/CLAUDE.md` 追加 qkrpc 段 | `<workspace>/CLAUDE.md` merge |
| VS Code Copilot | 不默认写入（用户级无标准路径） | `<workspace>/.github/copilot-instructions.md` 或 `.vscode/copilot-instructions.md` |

Phase 1 优先 Cursor skill；Claude Code `CLAUDE.md` merge 放 Phase 2。

---

## 6. Rules

### 6.1 内容来源

新增 `docs/agent-rules/qkrpc.mdc`（模板），安装时复制：

| 范围 | 目标 |
|------|------|
| 用户级 | `~/.cursor/rules/qkrpc.mdc` |
| 项目级 | `.cursor/rules/qkrpc.mdc` |

内容要点（短表，非全文 skill）：

- 先 `docs_get` topic `overview` → `authoring-workflow`
- step-runner：`search` → `get`，禁止猜 `inputParams`
- 磁盘编辑：`data.json` / `files/` → `qkrpc_sync push`
- 删除类工具需用户确认

---

## 7. 安装 Manifest

路径：

- 用户级：`~/.qkrpc/agent-setup.json`
- 项目级：`<workspace>/.qkrpc/agent-setup.json`

示例：

```json
{
  "cliVersion": "0.12.4",
  "installedAt": "2026-06-08T12:00:00Z",
  "workspaceRoot": "D:\\my-workspace",
  "targets": ["cursor", "vscode"],
  "skills": ["qkrpc", "quicker-authoring"],
  "scope": "user"
}
```

`qkrpc agent setup --check`：对比 `cliVersion` 与当前 `qkrpc.exe` 版本；不一致时 stderr 提示重跑 setup。不自动覆盖用户已改动的 MCP config（仍用 merge 策略）。

---

## 8. MCP 工具面（不变）

第三方 Agent 保持现有 ~16 工具，不引入 QuickerAgent 专有工具：

| 类别 | 工具 |
|------|------|
| 连通 | `qkrpc_health`, `qkrpc_wait` |
| 通用 | `qkrpc_invoke` |
| 动作 | `qkrpc_action`, `qkrpc_action_delete` |
| 子程序 | `qkrpc_subprogram`, `qkrpc_subprogram_delete` |
| 同步 | `qkrpc_sync` |
| 编写 | `qkrpc_step_runner_search`, `qkrpc_step_runner_get`, `qkrpc_fa` |
| 设置 | `quicker_settings` |
| 文档 | `docs_index`, `docs_get`, `docs_search` |

---

## 9. 与 QuickerAgent 边界

| 维度 | QuickerAgent | 本设计（第三方 Agent） |
|------|--------------|------------------------|
| 工具数量 | 40+ registry tools | ~16 MCP tools |
| 程序体编辑 | `workspace_program` patch | 文件编辑 + `qkrpc_sync` |
| UI | 步骤设计器、嵌入式浏览器 | 无 |
| 安装 | 安装包自带 | `qkrpc agent setup`（用户级默认） |

---

## 10. 分发

| 产物 | 来源 | 更新 |
|------|------|------|
| `qkrpc.exe` | GitHub Release | 用户升级 CLI 后重跑 `agent setup` |
| Skills | `docs/skills/` 打包进安装目录或 repo | setup 时覆盖复制到用户目录 |
| Rules 模板 | `docs/agent-rules/` | 同 skills |
| MCP tools | CLI 编译内嵌 | 随 CLI 自动更新 |

安装目录布局（建议，Phase 1 实现）：

```
%LOCALAPPDATA%\Programs\qkrpc\
  qkrpc.exe
  skills\
    qkrpc\
    quicker-authoring\
  agent-rules\
    qkrpc.mdc
```

`ResolveSkillSource` 查找顺序：显式 `--skill-source` → cwd 向上 `docs/skills` → exe 旁 `skills/`。

---

## 11. 实现阶段

### Phase 1（本规格 MVP）

- [x] `qkrpc agent setup` 命令 + `mcp install` 别名
- [x] 默认用户级：Cursor MCP + skills + rules + `~/.qkrpc/agent-setup.json`
- [x] 新增 `docs/skills/qkrpc/SKILL.md`
- [x] 多 skill 复制（`qkrpc` + `quicker-authoring`）
- [x] `docs/agent-rules/qkrpc.mdc` 模板
- [x] `--check` 版本检测
- [x] `--project` 保持现有行为，文档标明 opt-in
- [x] 更新 `docs/agent-mcp-integration.md`、`README.md` §4

### Phase 2

- [x] Claude Code 用户级 `~/.claude/CLAUDE.md` merge
- [x] `quicker-sync` / `quicker-run` skills
- [x] `--upgrade` 仅刷新 skills/rules，不碰用户改过的 MCP 字段
- [x] skill 内 MCP tool id 对照表（`docs/skills/qkrpc/references/mcp-tools.md`）

### Phase 3

- [x] `qkrpc serve` OpenAPI 导出（`GET /openapi.json`、`qkrpc serve openapi`）
- [x] npm 薄包装 MCP（`packages/qkrpc-mcp` → `@quickerhub/qkrpc-mcp`）
- [x] Skill 分发文档（[agent-skill-distribution.md](../../agent-skill-distribution.md)；Cursor Marketplace 远程 registry **暂缓**，用 `agent setup` / git 复制替代）

---

## 12. 测试计划

1. **干净机器**：安装 qkrpc setup.exe → `qkrpc agent setup` → 验证 `~/.cursor/mcp.json`、`~/.cursor/skills/`、`~/.qkrpc/agent-setup.json`。
2. **已有 MCP config**：重复 setup，确认 merge 不丢其他 server。
3. **`--check`**：升级 CLI 后返回过期提示。
4. **`--project`**：在样例仓库生成 `.cursor/mcp.json` 等，且不作为默认行为。
5. **MCP 连通**：Cursor 中 `qkrpc_health` 成功；`docs_get` topic `authoring-workflow` 可读。
6. **无 repo 场景**：仅安装目录 `skills/` 时 skill 安装成功。

---

## 13. 相关文件

| 路径 | 变更 |
|------|------|
| `QuickerRpc.Console/Mcp/QkrpcMcpInstaller.cs` | 扩展为 agent setup |
| `QuickerRpc.Console/QkrpcCliHelp.cs` | 新命令帮助 |
| `docs/skills/qkrpc/SKILL.md` | 新增 |
| `docs/agent-rules/qkrpc.mdc` | 新增 |
| `docs/agent-mcp-integration.md` | 更新默认用户级说明 |
| `publish/` | 打包 skills + rules 到安装目录 |

---

## 14. 已确认决策

| 问题 | 决策 |
|------|------|
| 默认安装范围 | **用户级**；`--project` 显式 opt-in |
| VS Code 扩展 | **暂不做**；仅 MCP + 可选 copilot-instructions（项目级） |
| 主场景 | Cursor / VS Code Copilot / Claude Code 开发者写动作 |

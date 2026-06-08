# 在其他 Agent 中使用 quicker-rpc

> 面向 Cursor、VS Code Copilot、Claude Desktop、Windsurf、Cline、Claude Code 等 MCP 宿主。  
> QuickerAgent（`agent-gui/`）内置完整工具集；本文说明 **仅用 `qkrpc` MCP** 接入第三方 Agent 的方式。

---

## 前置条件

1. 安装 [qkrpc CLI](https://github.com/QuickerHub/quicker-rpc/releases/latest)（`qkrpc-win-x64-setup.exe`）。
2. Quicker 已运行，且已加载 **QuickerRpc 插件**（见 [README.md](../README.md) §2）。
3. 工作区目录（用于磁盘编辑 `.quicker/`）— 安装时通过 `--workspace` 指定，默认 `cwd`。

---

## 一键安装

默认 **用户级**（写入 `~/.cursor/mcp.json`、`~/.cursor/skills/`、`~/.cursor/rules/`），不修改当前仓库。

```powershell
# 推荐：用户级 MCP + skills + rules
qkrpc agent setup

# 检查配置是否与当前 CLI 版本一致
qkrpc agent setup --check

# 仅刷新 skills / rules / Claude Code 指引（不改动 MCP 配置）
qkrpc agent setup --upgrade

# 所有主流 Agent 用户级 MCP
qkrpc agent setup --all

# 团队 opt-in：额外写入项目级配置（可 commit）
qkrpc agent setup --project --workspace D:\my-quicker-workspace

# 向后兼容别名
qkrpc mcp install
```

| 标志 | 写入位置 | 配置格式 |
|------|----------|----------|
| `--cursor`（默认） | `~/.cursor/mcp.json` | `mcpServers` |
| `--claude` | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` |
| `--vscode` | VS Code 用户 `mcp.json` | `servers` + `type: stdio` |
| `--windsurf` | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` |
| `--cline` | Cline `cline_mcp_settings.json` | `mcpServers` |
| `--all` | 上表全部用户级路径 | — |
| `--project` | 当前目录 `.cursor/mcp.json`、`.vscode/mcp.json`、`.mcp.json` | 按宿主 |

安装还会（用户级默认）：

- 设置 MCP env：`QKRPC_WORKSPACE_ROOT`、`QKRPC_SETUP_VERSION`
- 复制 skills：`qkrpc`、`quicker-rpc-knowledge`、`quicker-authoring`、`quicker-sync`、`quicker-run` → `~/.cursor/skills/`
- 复制 rules：`qkrpc.mdc` → `~/.cursor/rules/`
- 合并 Claude Code 指引：`~/.claude/CLAUDE.md`（`<!-- qkrpc-agent-setup -->` 段）
- 写入 manifest：`~/.qkrpc/agent-setup.json`

**仅 `--project` 时**额外：

- 项目 `.cursor/mcp.json`、`.vscode/mcp.json`、`.mcp.json`
- `.vscode/settings.json` 终端 PATH
- `.quicker/` bootstrap
- 可选 `--project-skills` 复制 skills 到项目 `.cursor/skills/`

**重启** 对应 Agent / 重载 MCP 面板后生效。

---

## MCP 工具一览

`qkrpc mcp` 通过 stdio 暴露约 **16 个** MCP 工具（Windsurf 全局 100 工具上限内安全）：

| 工具 | 用途 |
|------|------|
| `qkrpc_health` | 检测 QuickerRpc 插件连通性 |
| `qkrpc_wait` | 轮询等待插件就绪 |
| `qkrpc_invoke` | 通用 op 调用（`action.list`、`guide.get` 等） |
| `qkrpc_action` | 动作 CRUD / run / publish / profile / process |
| `qkrpc_action_delete` | 删除动作（destructive） |
| `qkrpc_subprogram` | 公共子程序 |
| `qkrpc_subprogram_delete` | 删除子程序 |
| `qkrpc_sync` | 工作区 pull/push/status |
| `qkrpc_step_runner_search` / `qkrpc_step_runner_get` | 步骤模块 schema（须两步，勿猜参） |
| `qkrpc_fa` | Font Awesome 图标搜索 |
| `quicker_settings` | Quicker 设置读写 |
| `docs_index` / `docs_get` / `docs_search` | 内置编写指南 |

与 QuickerAgent 的差异：第三方 Agent **没有** `workspace_program` 磁盘 patch UI、`browser`、审批流等；磁盘编辑走 **`qkrpc_sync` + 文件工具**（见 `.quicker/README.md`）。

---

## 各 Agent 手动配置参考

若不用 `qkrpc mcp install`，可手动添加 stdio 服务器：

```json
{
  "command": "C:\\Users\\YOU\\AppData\\Local\\Programs\\qkrpc\\qkrpc.exe",
  "args": ["mcp"],
  "env": {
    "QKRPC_WORKSPACE_ROOT": "D:\\your-workspace"
  }
}
```

**VS Code / Copilot** 使用 `servers` 键并加 `"type": "stdio"`：

```json
{
  "servers": {
    "qkrpc": {
      "type": "stdio",
      "command": "...\\qkrpc.exe",
      "args": ["mcp"],
      "env": { "QKRPC_WORKSPACE_ROOT": "..." }
    }
  }
}
```

### Claude Code CLI

```bash
claude mcp add qkrpc -- qkrpc mcp
```

或在项目根维护 `.mcp.json`（`mcpServers` 格式）；`qkrpc mcp install --project` 会写入。

### 仅 CLI、无 MCP

任何能跑 shell 的 Agent 可直接调用：

```powershell
qkrpc guide get --topic authoring-workflow --json
qkrpc action list --query "keyword" --json
```

工作区终端需 PATH 含 `qkrpc`（安装器会写 `.vscode/settings.json`）。

### HTTP 集成（自建 Agent）

高频场景可启动持久 HTTP 服务：

```powershell
qkrpc serve   # http://127.0.0.1:9477/health , POST /v1/invoke
curl http://127.0.0.1:9477/openapi.json
qkrpc serve openapi --json
```

QuickerAgent 默认走此路径；其他语言 Agent 可 HTTP 封装，无需 MCP。

### npm MCP 薄包装（Node 宿主）

若 MCP 配置要求 Node/`npx` 入口：

```json
{
  "command": "npx",
  "args": ["-y", "@quickerhub/qkrpc-mcp"],
  "env": { "QKRPC_WORKSPACE_ROOT": "D:\\your-workspace" }
}
```

仍需本机安装 `qkrpc.exe`；npm 包仅 spawn `qkrpc mcp`。Skills 仍用 `qkrpc agent setup`。详见 [packages/qkrpc-mcp/README.md](../packages/qkrpc-mcp/README.md)、[agent-skill-distribution.md](agent-skill-distribution.md)。

---

## 编写约定（所有 Agent 通用）

1. **先读指南**：`docs_get` topic `overview` → `authoring-workflow`（或 `qkrpc guide get --json`）。
2. **step-runner 两步**：`qkrpc_step_runner_search` → `qkrpc_step_runner_get`，禁止猜 `inputParams`。
3. **磁盘编辑**：edit `data.json` / `files/` → `qkrpc_sync push`；勿 inline patch。
4. **连通失败**：用 `qkrpc_wait`，勿 shell 连环 ping。

详见 [AGENTS.md](../AGENTS.md)、[docs/agent-tool-granularity.md](agent-tool-granularity.md)。

---

## 与 QuickerAgent 选型

| 场景 | 推荐 |
|------|------|
| 日常写动作、可视化步骤编辑、浏览器自动化 | **QuickerAgent**（`start-agent-gui.ps1` 或安装包） |
| 已在 Cursor / VS Code / Claude 中开发 | **`qkrpc mcp install --all`** |
| CI / 脚本 / 无 GUI | **`qkrpc` CLI** 或 **`qkrpc serve` HTTP** |
| 团队共享 MCP 配置 | `qkrpc mcp install --project` 后 commit `.vscode/mcp.json` 等 |

QuickerAgent 是 quicker-rpc 的 **一等公民**（完整 tool registry + workspace UI）；MCP 层提供 **跨 Agent 的最小可用面**，通过 `qkrpc_invoke` 可访问全部 serve op。

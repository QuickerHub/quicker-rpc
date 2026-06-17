# 在其他 Agent 中使用 quicker-rpc

> 面向 Cursor、VS Code Copilot、Claude Desktop、Windsurf、Cline、Claude Code、**Codex** 等 MCP 宿主。  
> QuickerAgent（`agent-gui/`）内置完整工具集；本文说明 **仅用 `qkrpc` MCP** 接入第三方 Agent 的方式。

**Agent 自安装（给 Codex / 无用户在场时）**：见 **[agent-mcp-self-install.md](agent-mcp-self-install.md)** — 按步骤在 shell 执行，勿只输出命令让用户手跑。

---

## 前置条件

1. 安装 [qkrpc CLI](https://github.com/QuickerHub/quicker-rpc/releases/latest)（`qkrpc-win-x64-setup.exe`）。
2. Quicker 已运行，且已加载 **QuickerRpc 插件**（见 [README.md](../README.md) — 加载 Quicker 插件）。
3. 工作区目录（用于磁盘编辑 `.quicker/`）— 安装时通过 `--workspace` 指定，默认 `cwd`。

---

## 一键安装

**Cursor（推荐）**：安装 qkrpc 后默认装 **本地插件**（含 MCP、skills、rules），**不写** `~/.cursor/mcp.json` 与用户级 `~/.cursor/skills/`。

```powershell
# 交互式向导
qkrpc agent install

# 默认：仅 Cursor 插件
qkrpc agent setup

# 其它宿主
qkrpc agent setup --codex --project --workspace D:\my-quicker-workspace
qkrpc agent setup --all          # 全部 MCP；Cursor 仍走插件

# 检查 / 刷新
qkrpc agent setup --check
qkrpc agent setup --check --json
qkrpc agent setup --upgrade      # 刷新 Cursor 插件 + Claude 指引

# 团队 opt-in：项目级 MCP（可 commit）
qkrpc agent setup --project --workspace D:\my-quicker-workspace

# 向后兼容别名
qkrpc mcp install
```

| 标志 | 行为 |
|------|------|
| 默认 / `--cursor` / `--cursor-plugin` | Cursor 本地插件 `~/.cursor/plugins/local/quicker-rpc` |
| `--codex` / `--codex-plugin` | Codex 本地插件 `~/.codex/plugins/quicker-rpc` + 个人 marketplace |
| `--claude` | `%APPDATA%\Claude\claude_desktop_config.json` |
| `--vscode` | VS Code 用户 `mcp.json` |
| `--windsurf` | `~/.codeium/windsurf/mcp_config.json` |
| `--cline` | Cline `cline_mcp_settings.json` |
| `--codex` | `codex mcp add`；`--project` 合并 `AGENTS.md`（插件已含 MCP 时通常无需手配） |
| `--all` | 上表 MCP 宿主 + Cursor 插件 |
| `--project` | 当前目录 `.cursor/mcp.json`、`.vscode/mcp.json`、`.mcp.json` |

安装还会：

- 非 Cursor 宿主：写入对应 `mcp.json` / Codex TOML，env 含 `QKRPC_WORKSPACE_ROOT`
- Cursor：插件内 `mcp.json` + skills + rules（**勿**再手动复制到 `~/.cursor/skills`）
- Claude Code：`~/.claude/CLAUDE.md` 指引段
- manifest：`~/.qkrpc/agent-setup.json`

**仅 `--project` 时**额外：项目 MCP、`.vscode/settings.json` PATH、`.quicker/` bootstrap；可选 `--project-skills` 复制到项目 `.cursor/skills/`。

**Cursor**：重新安装或 `qkrpc agent setup --upgrade` 后插件会自动加载，无需退出 Cursor；在 Settings → MCP 确认 qkrpc 已启用。其它宿主重载 MCP 面板即可。

---

## MCP 工具一览

`qkrpc mcp` 暴露 Quicker 编排能力；**不提供文件读写**。完整列表见 [mcp-tools.md](skills/qkrpc/references/mcp-tools.md)。

核心分组：

| 分组 | 代表工具 |
|------|----------|
| 连通 | `qkrpc_health`、`qkrpc_wait` |
| 工作区说明 | MCP 资源 `quicker://workspace/readme`、`quicker://workspace/index`；`docs` topic `workspace-editing` |
| 工作区同步 | `workspace_program`（`projects_list` / `reindex` / `patch` / `validate` / `diagnostics`） |
| 动作 | `qkrpc_action_query` / `get` / `create` / `run` / `debug` / … |
| 子程序 | `qkrpc_subprogram_query` / `get` / `create` / … |
| Schema | `qkrpc_step_runner_search` + `qkrpc_step_runner_get`（两步，勿猜参） |
| 文档 | `docs`（`action=index|search|get`） |

推荐磁盘编辑流：

1. `qkrpc_action_get` — 拉到 `.quicker/`
2. 用 **宿主自带文件工具**（Cursor Read/Write/StrReplace 等）改 `data.json` / `files/`
3. `workspace_program` `action=patch` — 写入 Quicker
4. `qkrpc_action_run` 或 `qkrpc_action_debug`

与 QuickerAgent 的差异：第三方 Agent **没有** `workspace_program` 的文件读写子命令、`browser`、审批流、action-editor UI；磁盘编辑走宿主文件工具 + `patch`。

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

### Codex

```powershell
# 一键（需 codex 在 PATH）
qkrpc agent setup --codex --project --workspace D:\your-workspace

# 或手动
codex mcp add qkrpc --env QKRPC_WORKSPACE_ROOT=D:\your-workspace -- "%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe" mcp
codex mcp list
```

项目 `AGENTS.md` 指引：`docs/agent-rules/codex-qkrpc.md`（`--project` 时 setup 自动合并）。

完整 Agent 逐步说明：**[agent-mcp-self-install.md](agent-mcp-self-install.md)**。官方：[Codex MCP](https://developers.openai.com/codex/mcp)。

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

1. **先读指南**：`docs` action=get topic `overview` → `authoring-workflow`（或 `qkrpc guide get --json`）。
2. **step-runner 两步**：`qkrpc_step_runner_search` → `qkrpc_step_runner_get`，禁止猜 `inputParams`。
3. **磁盘编辑**：用宿主文件工具改 `.quicker/` → `workspace_program` action=patch；勿 inline patch。
4. **连通失败**：用 `qkrpc_wait`，勿 shell 连环 ping。

详见 [AGENTS.md](../AGENTS.md)、[docs/agent-tool-granularity.md](agent-tool-granularity.md)。

---

## 与 QuickerAgent 选型

| 场景 | 推荐 |
|------|------|
| 日常写动作、可视化步骤编辑、浏览器自动化 | **QuickerAgent**（`pwsh ./dev.ps1` 或安装包） |
| 已在 Cursor / VS Code / Claude 中开发 | **`qkrpc mcp install --all`** |
| CI / 脚本 / 无 GUI | **`qkrpc` CLI** 或 **`qkrpc serve` HTTP** |
| 团队共享 MCP 配置 | `qkrpc mcp install --project` 后 commit `.vscode/mcp.json` 等 |

QuickerAgent 是 quicker-rpc 的 **一等公民**（完整 tool registry + workspace 文件工具）；MCP 层提供 **跨 Agent 的编排面**（动作/子程序/run + patch），文件编辑由宿主 Agent 完成。

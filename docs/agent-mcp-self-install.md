# Agent 自安装 qkrpc MCP

> **读者**：Cursor / Codex / Claude Code 等第三方 Agent。用户说「接入 Quicker」「装 qkrpc MCP」时，**由你**按本文在终端执行，不要只把命令丢给用户。

---

## 0. 判断宿主

| 宿主 | MCP 配置方式 | 规则/技能 |
|------|----------------|-----------|
| **Cursor** | `qkrpc agent setup`（首选） | 自动复制 skills + `qkrpc.mdc` |
| **Codex** | `codex mcp add` 或 `~/.codex/config.toml` | 合并 `docs/agent-rules/codex-qkrpc.md` → 项目 `AGENTS.md` |
| **Claude Code** | `claude mcp add` 或 `qkrpc agent setup --claude` | `CLAUDE.md` 段（setup 可写） |
| **其他** | 见 [agent-mcp-integration.md](agent-mcp-integration.md) 手动 JSON | 阅读 `docs/skills/qkrpc/` |

---

## 1. 前置检查（必做）

在 shell 中执行，失败则停止并告知用户缺什么：

```powershell
# 1) qkrpc CLI
$qkrpc = "$env:LOCALAPPDATA\Programs\qkrpc\qkrpc.exe"
if (-not (Test-Path $qkrpc)) { Get-Command qkrpc -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source }
# 应得到 qkrpc.exe 路径

# 2) 插件连通（Quicker 需已运行且加载 QuickerRpc 插件）
& $qkrpc ping --json
# 失败时：& $qkrpc wait --json ；仍失败 → 请用户启动 Quicker 并加载插件，不要连环 ping

# 3) 工作区根（含 .quicker 的目录；无则 setup 会 bootstrap）
# 默认用当前项目根；用户指定则用其路径
$workspace = (Get-Location).Path   # 或用户给出的绝对路径
```

记下：`$qkrpc` 绝对路径、`$workspace` 绝对路径。

---

## 2. Cursor（最快）

```powershell
qkrpc agent setup --workspace $workspace
# 团队共享配置：
# qkrpc agent setup --project --workspace $workspace

qkrpc agent setup --check
```

完成后请用户 **重载 Cursor MCP**。你应能调用 `qkrpc_health`、`docs`、`workspace_program` 等工具。

---

## 3. Codex

### 3.1 注册 MCP

**优先**：Codex CLI 在 PATH 时：

```powershell
codex mcp add qkrpc `
  --env "QKRPC_WORKSPACE_ROOT=$workspace" `
  -- $qkrpc mcp

codex mcp list
```

若 `codex` 不在 PATH，改用手写 `%USERPROFILE%\.codex\config.toml`（Windows）：

```toml
[mcp_servers.qkrpc]
command = "C:\\Users\\YOU\\AppData\\Local\\Programs\\qkrpc\\qkrpc.exe"
args = ["mcp"]
enabled = true

[mcp_servers.qkrpc.env]
QKRPC_WORKSPACE_ROOT = "D:\\your-workspace"
```

项目级（仅 **trusted project**）：在工作区根建 `.codex/config.toml`，内容同上。

官方文档：<https://developers.openai.com/codex/mcp>

### 3.2 写入 AGENTS.md

将 quicker-rpc 仓库中 `docs/agent-rules/codex-qkrpc.md` 全文合并进 **当前项目根 `AGENTS.md`**：

- 若已有 `<!-- qkrpc-agent-setup:begin -->` … `end -->` 块，**替换该块**
- 若无该块且文件未提及 qkrpc，**追加到文末**
- 把片段里的 `<workspace-root>` 换成 `$workspace` 实际路径

或一键（在 quicker-rpc 仓库根、已 build 的 CLI）：

```powershell
qkrpc agent setup --codex --project --workspace $workspace
```

### 3.3 验证

1. 新开 Codex 会话，运行 `/mcp` 或 `codex mcp list`，应看到 `qkrpc`
2. 调用 MCP `qkrpc_health`（或 `qkrpc_wait`）
3. 调用 MCP `docs`：`action=get`，`topic=workspace-editing`

---

## 4. Claude Code

```powershell
qkrpc agent setup --claude --workspace $workspace
# 或仅 MCP：
claude mcp add qkrpc --env QKRPC_WORKSPACE_ROOT=$workspace -- $qkrpc mcp
```

`CLAUDE.md` 指引由 `qkrpc agent setup` 合并（`docs/agent-rules/claude-qkrpc.md`）。

---

## 5. 安装后你怎么用（所有宿主）

1. **连通**：`qkrpc_wait` / `qkrpc_health`
2. **读指南**：`docs` `action=get` `topic=authoring-workflow`
3. **工作区布局**：MCP 资源 `quicker://workspace/readme`，或 `docs` `topic=workspace-editing`
4. **拉取**：`qkrpc_action_get` / `qkrpc_subprogram_get`
5. **改程序体**：用 **宿主文件工具** 编辑 `.quicker/.../data.json` 和 `files/`（MCP **不提供**文件读写）
6. **保存进 Quicker**：`workspace_program` `action=patch`
7. **运行**：`qkrpc_action_run` 或 `qkrpc_action_debug`

工具表：[skills/qkrpc/references/mcp-tools.md](skills/qkrpc/references/mcp-tools.md)

---

## 6. 升级 / 重装

```powershell
# 刷新 Cursor skills/rules（不动 MCP）：
qkrpc agent setup --upgrade

# CLI 升级后检查：
qkrpc agent setup --check

# Codex：用新版本 qkrpc.exe 重新 codex mcp add（同名会更新配置）
```

---

## 7. 禁止

- 连通失败时反复 shell `qkrpc ping`（用 MCP `qkrpc_wait` 一次即可）
- 未 `qkrpc_step_runner_get` 就猜 `inputParams`
- 用 MCP 读写信程序体（应用宿主文件工具）
- 将 `~/.qkrpc/agent-setup.json` 或含密钥的配置提交到 git

---

## 8. 汇报给用户

安装完成后简短说明：

1. 宿主（Codex / Cursor / …）与配置文件路径
2. `QKRPC_WORKSPACE_ROOT` 取值
3. `qkrpc agent setup --check` 或 `codex mcp list` 结果
4. 若改了 MCP：请用户重开会话或 `/mcp` 刷新

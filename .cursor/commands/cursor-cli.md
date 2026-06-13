# Cursor CLI — quicker-rpc 编程用法

在 **quicker-rpc 仓库根目录** 使用 Cursor Agent 命令行（`agent` / `cursor-agent`）。

## 一次性配置（本机）

### 1. 确认 CLI 在 PATH

```powershell
agent --version
# 期望: 2026.xx.xx-...
# 若找不到: Cursor 命令面板 → Install 'cursor' command / 见 https://cursor.com/docs/cli
```

默认路径：`%LOCALAPPDATA%\cursor-agent\`

### 2. 登录（必做）

当前机器 `agent status` 为 **Not logged in** 时，headless 会挂起或失败。

在 **交互式终端**（Cursor 集成终端或 Windows Terminal，非 Agent 后台 shell）执行：

```powershell
agent login
```

或设置 [Cursor Dashboard API Key](https://cursor.com/settings) 后：

```powershell
$env:CURSOR_API_KEY = "key_..."
agent status
```

### 3. 加载本仓库环境

```powershell
cd D:\source\repos\quicker\quicker-rpc
. ./scripts/cursor-agent-env.ps1
Test-CursorAgentAuth
```

### 4. 更新 CLI（可选）

```powershell
agent update
# 或 agent upgrade
```

---

## 常用命令

| 场景 | 命令 |
|------|------|
| 交互 REPL | `agent` |
| 只读规划 | `agent --plan "分析 step-module learning 进度"` |
| 非交互单轮 | `agent -p --force --workspace . "一句话任务"` |
| 新建会话 ID | `agent create-chat` |
| 续聊 | `agent --resume <chatId> -p --force "继续"` |
| 最近会话 | `agent resume` |
| 列出会话 | 在 **真实 TTY** 里 `agent ls`（脚本里可能 Ink 报错） |
| 绑定工作区 | `--workspace D:\source\repos\quicker\quicker-rpc` |

### 本仓库包装脚本

```powershell
# 自动 create-chat / 复用 .cursor/agent-cli/last-chat-id.txt
pwsh -NoProfile -File ./scripts/Invoke-CursorAgent.ps1 -Prompt "说明 quicker-rpc 目录结构"

# 强制新会话
pwsh -NoProfile -File ./scripts/Invoke-CursorAgent.ps1 -Prompt "..." -NewChat

# JSON 输出（脚本解析）
pwsh -NoProfile -File ./scripts/Invoke-CursorAgent.ps1 -Prompt "..." -OutputFormat json -Force
```

Headless 建议参数：

- `-p` / `--print` — 非交互
- `--force` — 少打断（等同旧版 `--yolo`）
- `--approve-mcps` — 自动批准 MCP（脚本场景）
- `--output-format json` — 机器可读

**注意**：本仓库较新文档里的 `--trust` 在当前 CLI 版本可能不存在，用 `--force`。

---

## 与 qkrpc 配合

终端已预置（`.vscode/settings.json`）：

- `QKRPC_WORKSPACE_ROOT` / `QKRPC_CWD` → 仓库根
- `PATH` 含 `publish\cli` 与 `%LOCALAPPDATA%\Programs\qkrpc`

Agent 改 Quicker 动作仍优先 **qkrpc MCP**；CLI 适合 benchmark 循环、仓库内 coding、CI。

```powershell
qkrpc health
qkrpc guide get --topic authoring-workflow --json
```

MCP/skills 安装：`qkrpc agent setup --upgrade`（见 `/agent-setup`）。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| `Not logged in` | `agent login` 或有效 `CURSOR_API_KEY` |
| headless 长时间无输出 | 先登录；加 `-Force`；检查网络 |
| `agent ls` Ink raw mode 错误 | 在交互终端运行，勿在 CI 无 TTY 环境 |
| `unknown option '--trust'` | 改用 `--force` |
| 版本不更新 | 重装 Cursor 或从官网重装 cursor-agent |

---

## Cursor SDK（脚本化 / benchmark）

结构化 TypeScript API，适合 benchmark 与 loop。见 **`/cursor-sdk`** 或 [cursor-sdk.md](./cursor-sdk.md)。

```powershell
pwsh -NoProfile -File ./scripts/Invoke-CursorSdk.ps1
pwsh -NoProfile -File ./scripts/Invoke-CursorSdk.ps1 -WithQkrpc
```

---

## 相关

- [Cursor CLI 文档](https://cursor.com/docs/cli/using)
- [CLI 参数](https://cursor.com/docs/cli/reference/parameters)
- [Deeplink](https://cursor.com/docs/reference/deeplinks) — 预填 prompt（需用户确认，非 headless）
- 本仓库 benchmark：`docs/agent-authoring-benchmark.md`

# Quicker RPC — Cursor plugin

在 Cursor 里无头创作 / 编辑 Quicker 动作（P0–P7），工具名与 QuickerAgent `agent-gui` 对齐。

## 安装（从 GitHub 仓库）

**前置**：Windows、[qkrpc CLI](https://github.com/QuickerHub/quicker-rpc/releases/latest)、Quicker 已加载 QuickerRpc 插件。

### 方式 A — 一条命令（推荐）

```powershell
pwsh -NoProfile -Command "& { git clone --depth 1 https://github.com/QuickerHub/quicker-rpc `"$env:USERPROFILE\.cursor\plugins\repos\quicker-rpc`"; pwsh -NoProfile -File `"$env:USERPROFILE\.cursor\plugins\repos\quicker-rpc\scripts\install-cursor-plugin.ps1`" }"
```

或克隆后本地安装：

```powershell
git clone --depth 1 https://github.com/QuickerHub/quicker-rpc
cd quicker-rpc
pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1
```

仅安装脚本（自动 clone 到 `%USERPROFILE%\.cursor\plugins\repos\quicker-rpc`）：

```powershell
git clone --depth 1 https://github.com/QuickerHub/quicker-rpc "$env:TEMP\qkrpc-install"
pwsh -NoProfile -File "$env:TEMP\qkrpc-install\scripts\install-cursor-plugin.ps1" -RepoUrl https://github.com/QuickerHub/quicker-rpc
```

然后 Cursor 会自动加载插件；在 Settings → Plugins / MCP 中确认 `qkrpc` 已启用。

### 方式 B — Teams 从仓库导入

Cursor **Teams / Enterprise**：Dashboard → Settings → Plugins → Team Marketplaces → **Import from Repo** →

`https://github.com/QuickerHub/quicker-rpc`

仓库根目录 `.cursor-plugin/marketplace.json` 会指向本插件。成员在 Marketplace 面板安装 `quicker-rpc`。

### 卸载

```powershell
pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1 -Uninstall
```

## 包含内容

| 组件 | 说明 |
|------|------|
| Logo | `assets/logo.svg`（与 QuickerAgent 同系立方标识） |
| MCP `qkrpc` | stdio → 本机 `qkrpc mcp` |
| Skills | `quicker-authoring`、`qkrpc`、`quicker-rpc-knowledge`、`quicker-eval-expression`、`quicker-run` |
| Rules | `qkrpc.mdc` |
| Commands | `/agent-setup` — CLI 升级后刷新指引 |

插件**不**包含 `qkrpc.exe`；MCP 依赖本机 PATH 上的 `qkrpc`。

## vs QuickerAgent

| 能力 | 本插件 | QuickerAgent |
|------|--------|--------------|
| 无头 P0–P7 编写 | ✅ | ✅ |
| 磁盘 `.quicker/` + patch | Cursor 文件工具 + `workspace_program` | ✅ |
| 可视化步骤设计器 | ❌ | ✅ |
| 浏览器 / shell | ❌ | ✅ |

## 开发（本 monorepo）

**不要**把 `cursor-plugin/quicker-rpc/skills/`、`rules/` 提交进 Git（已 `.gitignore`）。只改 `docs/skills/`、`docs/agent-rules/`。

```powershell
pwsh -NoProfile -File ./scripts/sync-cursor-plugin.ps1      # 生成本地插件包
pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1   # 链到 ~/.cursor/plugins/local/
```

见 `cursor-plugin/quicker-rpc/ASSETS.md`。

## 后备

不装插件也可用：`qkrpc agent setup`（写入 `~/.cursor/mcp.json` + skills）。见 [docs/agent-mcp-integration.md](../../docs/agent-mcp-integration.md)。

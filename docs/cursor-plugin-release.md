# Cursor 插件

## 用户安装

1. 安装 [qkrpc CLI](https://github.com/QuickerHub/quicker-rpc/releases/latest)
2. 一条命令（默认即装 Cursor 插件）：

```powershell
qkrpc agent setup
```

或：

```powershell
qkrpc agent install
```

CLI 升级后刷新插件：

```powershell
qkrpc agent setup --upgrade
```

安装后 Cursor **会自动加载**本地插件（无需退出）；在 Settings → MCP 确认启用 qkrpc。

**不再**向 `~/.cursor/mcp.json`、`~/.cursor/skills/`、`~/.cursor/rules/` 写入用户级配置（避免与插件重复）。Codex / Claude 等仍用 `qkrpc agent setup --codex` 等。

## 维护者（main）

改 `docs/skills/`、`docs/agent-rules/` 后，`publish-rpc.ps1` 会自动 sync 并捆绑到 `cursor-plugin/`。

可选干净分支：

```powershell
pwsh -NoProfile -File ./scripts/publish-cursor-plugin-branch.ps1 -Push
```

| 场景 | 命令 |
|------|------|
| 普通用户 | `qkrpc agent setup` |
| Codex 等其它宿主 | `qkrpc agent setup --codex`（Codex 插件）/ `--all` |
| monorepo 研发 | `scripts/install-cursor-plugin.ps1` |

详见 [cursor-plugin/quicker-rpc/README.md](../cursor-plugin/quicker-rpc/README.md)

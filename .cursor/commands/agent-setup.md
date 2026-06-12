# qkrpc Agent 一键安装 / 刷新 skills + MCP

在 **quicker-rpc 仓库根目录** 执行。说明见 [docs/agent-mcp-integration.md](../docs/agent-mcp-integration.md)、[docs/agent-skill-distribution.md](../docs/agent-skill-distribution.md)。

## 何时执行

| 场景 | 命令 |
|------|------|
| 首次在本机 Cursor 接入 qkrpc | `qkrpc agent setup` |
| 热更新 / 升级 CLI 后刷新 skills、rules | `qkrpc agent setup --upgrade` |
| 研发中改了 `docs/skills/*` 或 `docs/agent-rules/*` | `qkrpc agent setup --upgrade`（在仓库根目录，自动从 `docs/skills` 复制） |
| 检查本机配置是否与 CLI 版本一致 | `qkrpc agent setup --check` |
| 团队仓库要 commit MCP 配置 | `qkrpc agent setup --project --workspace <path>`（可选 `--project-skills`） |
| 多宿主（VS Code、Claude Desktop 等） | `qkrpc agent setup --all` |

**向后兼容别名：** `qkrpc mcp install`（与 `agent setup` 相同）。

## 前置

1. 已安装 `qkrpc.exe`（Release 安装包或 `build.ps1 -t` 后的 `%LOCALAPPDATA%\Programs\qkrpc`）。
2. Quicker 已运行且已加载 QuickerRpc 插件（MCP 连通性与此无关，但使用工具时需要）。
3. 在仓库根目录执行时，`--upgrade` 会优先从本仓库 `docs/skills/`、`docs/agent-rules/qkrpc.mdc` 复制（无需 `--skill-source`）。

## 执行（研发默认）

```powershell
# 仅刷新 skills + rules + Claude 指引，不覆盖已有 MCP 配置
qkrpc agent setup --upgrade
```

首次安装或需重写 MCP 配置：

```powershell
qkrpc agent setup --workspace D:\your-quicker-workspace
```

`block_until_ms` ≥ **15000**。期望退出码 **0**，stderr 列出写入路径。

## 写入产物（用户级默认）

| 产物 | 路径 |
|------|------|
| MCP | `~/.cursor/mcp.json`（stdio: `qkrpc mcp`） |
| Skills | `~/.cursor/skills/`：`qkrpc`、`quicker-rpc-knowledge`、`quicker-authoring`、`quicker-sync`、`quicker-run` |
| Rules | `~/.cursor/rules/qkrpc.mdc` |
| Manifest | `~/.qkrpc/agent-setup.json`（`cliVersion` 用于 `--check`） |

## 验证

```powershell
qkrpc agent setup --check
# JSON for automation:
qkrpc agent setup --check --json
```

期望：`qkrpc agent setup: OK (CLI x.y.z.r)`，或 JSON 中 `"ok": true`。

然后在 Cursor：**重载 MCP**（Settings → MCP → 重启或 Reload）后应出现 `user-qkrpc` 工具。

可选连通性：

```powershell
# MCP 工具 qkrpc_health 等价
qkrpc ping --json
```

## 研发 skill 时注意

- Skill 源码目录：`docs/skills/<name>/`（发布时由 `publish/publish-rpc.ps1` 打入安装包 `skills/`）。
- 单 skill 调试：`qkrpc agent setup --upgrade --skill-source docs/skills/qkrpc`
- 第三方 MCP **不提供文件读写**；磁盘编辑走宿主文件工具 + `workspace_program` patch；说明见 `quicker-authoring` / `quicker://workspace/readme`。
- **Codex**：`qkrpc agent setup --codex --project --workspace <根>`；Agent 逐步说明见 `docs/agent-mcp-self-install.md`。
- npm `@quickerhub/qkrpc-mcp` 仅 spawn `qkrpc mcp`，**skills 仍须** `agent setup`。

## 禁止

- 将 `~/.qkrpc/agent-setup.json` 或用户级 `~/.cursor/mcp.json` 提交到本仓库
- 用 `--upgrade` 代替首次 `agent setup`（无 manifest 时会失败）
- 连通失败时反复 shell `qkrpc ping`（用 MCP `qkrpc_wait` 或告知用户检查 Quicker/插件）

## 完成后汇报

1. `--check` 结果与 manifest 中的 `cliVersion`。
2. 复制的 skill 列表（stderr 输出）。
3. 提醒用户重载 Cursor MCP（若刚写入或改了 MCP 配置）。

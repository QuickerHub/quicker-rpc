# qkrpc Agent 资产分发

> Skills、MCP、HTTP 三种接入方式的分发与更新路径。

## 推荐路径（Windows 开发者）

```powershell
# 安装 CLI 后（默认装 Cursor 插件）
qkrpc agent setup

# CLI 升级后刷新插件
qkrpc agent setup --upgrade
```

Cursor 走插件，**不再**复制到 `~/.cursor/skills/` / `~/.cursor/rules/`。其它宿主见 [agent-mcp-integration.md](agent-mcp-integration.md)。

## MCP 分发

| 方式 | 适用 |
|------|------|
| `qkrpc agent setup` | Cursor 插件；`--codex` / `--all` 等写各宿主 MCP |
| `qkrpc mcp` 直接 stdio | 手动 MCP 配置 |
| `@quickerhub/qkrpc-mcp` npm 包 | 需要 `npx` / Node bin 的 MCP 宿主 |

npm 包**仅启动** `qkrpc mcp`，不包含 skills。见 [packages/qkrpc-mcp/README.md](../packages/qkrpc-mcp/README.md)。

## Skills 分发

**单源原则：** 仓库内只维护 `docs/skills/`、`docs/agent-rules/`；其余路径均为**生成副本**（不入库或 gitignore）。

| 来源（编辑这里） | 生成到 | 何时 |
|------------------|--------|------|
| `docs/skills/*` | `cursor-plugin/quicker-rpc/skills/` | `sync-cursor-plugin.ps1`（**gitignore**） |
| `docs/skills/*` | `%LOCALAPPDATA%\Programs\qkrpc\cursor-plugin/` | `publish-rpc.ps1` 打包 CLI |
| `docs/agent-rules/qkrpc.mdc` | `cursor-plugin/.../rules/` | sync 脚本 |

| 路径 | 用途 |
|------|------|
| `docs/skills/*` | **唯一源码**（插件、CLI 嵌入均从这里复制） |
| `.cursor/skills/*` | **仅**本仓库研发 skill（build-test、agent-gui 等），**不是** authoring 副本 |

Skill 家族（插件默认）：`qkrpc`、`quicker-rpc-knowledge`、`quicker-authoring`、`quicker-eval-expression`、`quicker-run`。

**Scenario 子 skill**（`quicker-authoring-*`、`quicker-action-library-search` 等 12 个）在 `docs/skills/` 中 **on-demand**，由 QuickerAgent catalog 自动发现，**不**写入 setup 默认列表。见 [docs/README.md](README.md) §Scenario 子 skill。

`quicker-sync` 已 **deprecated**，不再默认安装；磁盘工作流见 skill `quicker-authoring` topic `workspace-editing`。旧安装可手动删除 `~/.cursor/skills/quicker-sync/`。

Monorepo 目录 `cursor-plugin/quicker-rpc/`；仓库根 `.cursor-plugin/marketplace.json` 供 Teams **Import from Repo**。

```powershell
# 本地 / 克隆后
pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1

# 从 GitHub 拉取并安装（clone 到 ~/.cursor/plugins/repos/quicker-rpc）
pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1 -RepoUrl https://github.com/QuickerHub/quicker-rpc
```

详见 [cursor-plugin/quicker-rpc/README.md](../cursor-plugin/quicker-rpc/README.md)。**无需**上架公开 Marketplace。

### Cursor Marketplace plugin（skills 同步）

**当前未实现**自动发布到 Cursor Marketplace。原因：远程 skill registry 尚无稳定公开 API，且 skills 需与 CLI 版本同步。

**替代方案**：

1. `qkrpc agent setup` / `--upgrade`（Cursor 插件）
2. 团队将 `.cursor/skills/` commit 到项目（`--project --project-skills`）
3. 从 `docs/skills/<name>/` 手动复制（不推荐）

## HTTP 集成（自建 Agent）

```powershell
qkrpc serve                              # http://127.0.0.1:9477
curl http://127.0.0.1:9477/openapi.json  # OpenAPI 3.1
qkrpc serve openapi --json               # 离线导出
qkrpc serve openapi --out openapi.json
```

`POST /v1/invoke` 通用 op 调用；完整 op 列表见响应字段 `x-qkrpc-invoke-ops` 与 `ServeInvokeDispatcher`。

## 版本契约

- `~/.qkrpc/agent-setup.json` 记录 `cliVersion`
- `qkrpc agent setup --check` 检测过期
- MCP env `QKRPC_SETUP_VERSION` 供调试

CLI 升级后：`qkrpc agent setup --upgrade`（skills/rules）或完整 `qkrpc agent setup`（含 MCP 路径更新）。

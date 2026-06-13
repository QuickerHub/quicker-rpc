# qkrpc Agent 资产分发

> Skills、MCP、HTTP 三种接入方式的分发与更新路径。

## 推荐路径（Windows 开发者）

```powershell
# 安装 CLI 后一次性配置（用户级默认）
qkrpc agent setup

# CLI 升级后仅刷新 skills/rules（保留 MCP 配置）
qkrpc agent setup --upgrade
```

产物位置见 [agent-mcp-integration.md](agent-mcp-integration.md)。

## MCP 分发

| 方式 | 适用 |
|------|------|
| `qkrpc agent setup` | Cursor / VS Code / Claude 等（写入各宿主 mcp.json） |
| `qkrpc mcp` 直接 stdio | 手动 MCP 配置 |
| `@quickerhub/qkrpc-mcp` npm 包 | 需要 `npx` / Node bin 的 MCP 宿主 |

npm 包**仅启动** `qkrpc mcp`，不包含 skills。见 [packages/qkrpc-mcp/README.md](../packages/qkrpc-mcp/README.md)。

## Skills 分发

| 来源 | 路径 |
|------|------|
| `qkrpc agent setup` | `~/.cursor/skills/` |
| 仓库源码 | `docs/skills/*` |
| CLI 安装目录 | `%LOCALAPPDATA%\Programs\qkrpc\skills\` |

Skill 家族（`qkrpc agent setup` 默认）：`qkrpc`、`quicker-rpc-knowledge`、`quicker-authoring`、`quicker-eval-expression`、`quicker-run`。

**Scenario 子 skill**（`quicker-authoring-*`、`quicker-action-library-search` 等 12 个）在 `docs/skills/` 中 **on-demand**，由 QuickerAgent catalog 自动发现，**不**写入 setup 默认列表。见 [docs/README.md](README.md) §Scenario 子 skill。

`quicker-sync` 已 **deprecated**，不再默认安装；磁盘工作流见 skill `quicker-authoring` topic `workspace-editing`。旧安装可手动删除 `~/.cursor/skills/quicker-sync/`。

### Cursor Marketplace / 远程 registry

**当前未实现**自动发布到 Cursor Marketplace。原因：远程 skill registry 尚无稳定公开 API，且 skills 需与 CLI 版本同步。

**替代方案**：

1. `qkrpc agent setup` / `--upgrade`（推荐）
2. 团队将 `.cursor/skills/` 或 rules commit 到项目（`--project --project-skills`）
3. 从本仓库 `docs/skills/<name>/` 手动复制到 `~/.cursor/skills/`

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

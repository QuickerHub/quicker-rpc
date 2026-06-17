# Cursor Marketplace 插件 — Quicker 动作创作

> 状态：v0.1 scaffold（2026-06-17）  
> 路径：`cursor-plugin/quicker-rpc/`

## 目标

把 QuickerAgent `agent-gui` 的**无头动作创作**能力（P0–P7、step-runner、workspace patch）通过 **Cursor 官方插件** 交付，与现有 `qkrpc agent setup` 并存。

## 非目标

- 不 bundle `qkrpc.exe`（Marketplace 政策）
- 不复刻 agent-gui 可视化 action-editor、browser、shell_exec
- 不替代 QuickerAgent 桌面壳

## 架构

```text
cursor-plugin/quicker-rpc/
  .cursor-plugin/plugin.json   manifest
  mcp.json                     stdio → qkrpc mcp（用户本机 CLI）
  skills/                      从 docs/skills/ 同步（5 core）
  rules/qkrpc.mdc              从 docs/agent-rules/ 同步
  commands/agent-setup.md      CLI 升级后刷新指引
```

与 `qkrpc agent setup` 对齐：

| 产物 | agent setup | Cursor plugin |
|------|-------------|---------------|
| MCP server | `~/.cursor/mcp.json` | 插件 `mcp.json` |
| Skills | `~/.cursor/skills/` | 插件 `skills/` |
| Rules | `~/.cursor/rules/` | 插件 `rules/` |
| 版本 | `~/.qkrpc/agent-setup.json` | `plugin.json version` ← `version.json` |

## 能力对照（agent-gui vs Cursor 插件）

| 能力 | Cursor 插件 + qkrpc MCP | QuickerAgent |
|------|-------------------------|--------------|
| P0–P7 无头编写 | ✅ | ✅ |
| `workspace_program` patch | ✅ | ✅ + file 子命令 |
| 磁盘 `.quicker/` | Cursor Read/Write | workspace_program |
| step-runner schema | ✅ | ✅ |
| 可视化设计器 | ❌ | ✅ |
| browser / shell | ❌ | ✅ |

## 同步与分发

```powershell
pwsh -NoProfile -File ./scripts/sync-cursor-plugin.ps1
pwsh -NoProfile -File ./scripts/sync-cursor-plugin.ps1 -Check
```

**用户安装**（无需 Marketplace）：

```powershell
pwsh -NoProfile -File ./scripts/install-cursor-plugin.ps1 -RepoUrl https://github.com/QuickerHub/quicker-rpc
```

Teams 可选：Dashboard → Import from Repo → 本仓库 URL（读根目录 `.cursor-plugin/marketplace.json`）。

## 后续（Phase 2）

- [ ] 第二个 marketplace entry：`quicker-authoring-extended`（12 scenario skills）
- [ ] CI：`sync-cursor-plugin.ps1 -Check` on PR
- [ ] `workspace_file` MCP（与 agent-gui 对齐）
- [ ] Team Marketplace 模板（企业内分发）

## 相关

- [agent-mcp-integration.md](../../agent-mcp-integration.md)
- [agent-skill-distribution.md](../../agent-skill-distribution.md)
- [2026-06-08-qkrpc-agent-setup-design.md](2026-06-08-qkrpc-agent-setup-design.md)
- [2026-06-09-universal-qkrpc-authoring-design.md](2026-06-09-universal-qkrpc-authoring-design.md)

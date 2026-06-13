# 文档索引

本仓库是 **QuickerAgent**（桌面 AI 助手）、**QuickerRpc 插件** 与 **`qkrpc` CLI** 的 monorepo。按角色选入口：

| 你是谁 | 从这里开始 |
|--------|------------|
| Quicker 用户，想用 AI 找 / 跑 / 改动作 | [quicker-agent.md](quicker-agent.md) → [下载安装包](https://github.com/QuickerHub/quicker-rpc/releases/latest/download/quicker-agent-win-x64-setup.exe) |
| 在 Cursor / VS Code / Claude 等 Agent 里写动作 | [agent-mcp-integration.md](agent-mcp-integration.md)（`qkrpc agent setup`） |
| 脚本、CI、自建集成 | [cli-commands.md](cli-commands.md)、`qkrpc help --json`、`qkrpc serve` HTTP |
| 贡献代码 / Coding Agent | 根目录 [README.md](../README.md) §开发、[AGENTS.md](../AGENTS.md) |
| 了解方向与优先级 | [ROADMAP.md](ROADMAP.md) |

---

## 产品与集成

| 文档 | 说明 |
|------|------|
| [quicker-agent.md](quicker-agent.md) | QuickerAgent 产品介绍、下载与 FAQ |
| [agent-mcp-integration.md](agent-mcp-integration.md) | 第三方 Agent 接入：`qkrpc agent setup`、MCP 工具、HTTP serve |
| [agent-skill-distribution.md](agent-skill-distribution.md) | Skills / rules 分发与版本 |
| [agent-tool-granularity.md](agent-tool-granularity.md) | QuickerAgent vs MCP 工具面差异 |
| [cli-commands.md](cli-commands.md) | `qkrpc` 命令参考（人类可读） |

---

## QuickerAgent 开发与运维

| 文档 | 说明 |
|------|------|
| [agent-gui/README.md](../agent-gui/README.md) | 本地开发、Electron 发布、LLM 配置 |
| [agent-gui/AGENTS.md](../agent-gui/AGENTS.md) | 改 UI 时的 Agent 约定 |
| [agent-gui-launcher.md](agent-gui-launcher.md) | `Alt+Space` 启动器设计 |
| [agent-gui-startup-performance.md](agent-gui-startup-performance.md) | Tauri 冷启动、splash、懒加载与并行策略 |
| [agent-gui-chat-storage.md](agent-gui-chat-storage.md) | 对话历史 JSON 存储 |
| [agent-gui-plugin-storage.md](agent-gui-plugin-storage.md) | 可选插件（语音等）目录与下载 |
| [quicker-agent-plugin-spec.md](quicker-agent-plugin-spec.md) | QuickerAgent Plugin 规范（manifest / registry / Host API） |
| [agent-gui-prompt-structure.md](agent-gui-prompt-structure.md) | 系统提示与 Skill 加载 |
| [agent-authoring-benchmark.md](agent-authoring-benchmark.md) | Agent 动作编写评测任务集（手动 / 半自动） |
| [voice-input-plugin.md](voice-input-plugin.md) | 语音输入产品设计 + WebSocket 协议 |
| [voxtype-quicker-integration.md](voxtype-quicker-integration.md) | VoxType 全局听写 × Quicker（HTTP + 插件） |
| [../voice-asr-runtime/README.md](../voice-asr-runtime/README.md) | 本地 ASR runtime（Python） |
| [clipboard-history-plugin.md](clipboard-history-plugin.md) | 剪贴板历史插件 |

---

## 动作编写与数据

| 文档 | 说明 |
|------|------|
| [quicker-action-data-storage.md](quicker-action-data-storage.md) | Quicker 动作数据存储架构 |
| [action-designer-agent-routing.md](action-designer-agent-routing.md) | 设计器打开时 `action get/patch` 自动走内存（Agent 无需 designer API） |
| [action-authoring-src/](action-authoring-src/) | **源码**：内置指南模板与 manifest（只改这里） |
| [action-authoring/cli/](action-authoring/cli/) | 生成物：`qkrpc guide get` 嵌入内容 |
| [skills/quicker-authoring/](skills/quicker-authoring/) | 生成物：QuickerAgent / `agent setup` 用的 Skill |

生成：`npm run docs:gen` 或 `node scripts/generate-authoring-docs.mjs`（`build.ps1`、`dotnet build QuickerRpc.AgentModel` 也会触发）。CI：`npm run docs:check`。

运行时入口：`qkrpc guide get --topic overview --json`。

---

## 架构速查

```text
QuickerAgent (agent-gui)  ──HTTP/CLI──►  qkrpc.exe  ──named pipe──►  QuickerRpc.Plugin  ──►  Quicker
第三方 Agent (MCP)       ──stdio mcp──►  qkrpc mcp  ──同上──►
```

- 管道名：`QuickerRpc_Server_QRPC2026`
- 高频 HTTP：`qkrpc serve` → `http://127.0.0.1:9477/health`
- 插件加载：`load {packagePath}/QuickerRpc.Plugin.{version}.dll`（详见根 [README.md](../README.md)）

---

## Agent 规则（机器可读）

| 路径 | 用途 |
|------|------|
| [../AGENTS.md](../AGENTS.md) | 仓库根：构建、测试、无头编辑约定 |
| [agent-rules/](../agent-rules/) | 各宿主 rules 片段（如 Claude） |
| [skills/](../skills/) | 随 `qkrpc agent setup` 分发的 Skill 源码 |

---

## 设计稿（superpowers）

内部规格与计划，非最终用户文档：

- [superpowers/specs/](superpowers/specs/)
- [superpowers/plans/](superpowers/plans/)

# 文档索引

本仓库是 **QuickerAgent**（桌面 AI 助手）、**QuickerRpc 插件** 与 **`qkrpc` CLI** 的 monorepo。

---

## 按角色选入口

| 你是谁 | 从这里开始 |
|--------|------------|
| Quicker 用户，想用 AI 找 / 跑 / 改动作 | [quicker-agent.md](quicker-agent.md) → [下载安装包](https://github.com/QuickerHub/quicker-rpc/releases/latest/download/quicker-agent-win-x64-setup.exe) |
| 在 Cursor / VS Code / Claude 等 Agent 里写动作 | [agent-mcp-integration.md](agent-mcp-integration.md)（`qkrpc agent setup`） |
| 脚本、CI、自建集成 | [cli-commands.md](cli-commands.md)、`qkrpc help --json`、`qkrpc serve` HTTP |
| 维护动作编写文档 / step 模块参考 | [authoring/PIPELINE.md](authoring/PIPELINE.md) |
| 贡献代码 / Coding Agent | 根 [README.md](../README.md) §开发、[AGENTS.md](../AGENTS.md) |
| 了解方向与优先级 | [ROADMAP.md](ROADMAP.md) |

---

## 我想…改/读哪里？（速查）

| 我想… | 读 / 改 | 不要改 |
|--------|---------|--------|
| 改 P1–P7 工作流、schema topic | [`action-authoring-src/`](action-authoring-src/) | `action-authoring/cli/`、`skills/.../references/` |
| 改 step 模块深文档、JSON 示例 | [`authoring-references/step-modules/authored/`](authoring-references/step-modules/authored/) | `cli/references/step-modules/` |
| 改 Agent 默认 skill 正文 | `action-authoring-src/skills/` → `npm run docs:gen` | 直接改 `docs/skills/` 大段正文 |
| 改构建 / 发布 / 前端检查 | [`.cursor/skills/`](../.cursor/skills/) | — |
| 查 CLI 命令 | [cli-commands.md](cli-commands.md) 或 `qkrpc help --json` | — |
| 看内部设计稿 | [superpowers/](superpowers/) | 当作用户文档 |
| 运行时编写指南 | `qkrpc guide get --topic overview --json` | — |

完整管线说明：[authoring/PIPELINE.md](authoring/PIPELINE.md)。

---

## 文档管线（动作编写）

```text
action-authoring-src/  ──docs:gen──►  action-authoring/cli/  +  docs/skills/
authoring-references/  ──直接嵌入──►  AgentModel + QuickerAgent docs 搜索
```

- **源码**：[`action-authoring-src/`](action-authoring-src/) — 唯一应改的 workflow / manifest
- **深参考**：[`authoring-references/`](authoring-references/) — step-modules、patterns、learned-skills
- **生成物**：[`action-authoring/cli/`](action-authoring/cli/)、[`skills/quicker-authoring/`](skills/quicker-authoring/) — CI 校验，勿手改正文
- **生成**：`npm run docs:gen` / `npm run docs:check`

---

## 产品与集成

| 文档 | 说明 |
|------|------|
| [quicker-agent.md](quicker-agent.md) | QuickerAgent 产品介绍、下载与 FAQ |
| [agent-mcp-integration.md](agent-mcp-integration.md) | 第三方 Agent 接入：`qkrpc agent setup`、MCP、HTTP serve |
| [agent-mcp-self-install.md](agent-mcp-self-install.md) | Agent 自装流程（分宿主） |
| [agent-skill-distribution.md](agent-skill-distribution.md) | Skills / rules 分发与版本 |
| [agent-tool-granularity.md](agent-tool-granularity.md) | QuickerAgent vs MCP 工具面差异 |
| [cli-commands.md](cli-commands.md) | `qkrpc` 命令参考（人类可读） |
| [action-designer-agent-routing.md](action-designer-agent-routing.md) | 设计器打开时 get/patch 自动走内存 |

---

## QuickerAgent 开发与运维

| 文档 | 说明 |
|------|------|
| [agent-gui/README.md](../agent-gui/README.md) | 本地开发、Electron 发布、LLM 配置 |
| [agent-gui/AGENTS.md](../agent-gui/AGENTS.md) | 改 UI 时的 Agent 约定 |
| [agent-gui-launcher.md](agent-gui-launcher.md) | `Alt+Space` 启动器设计 |
| [agent-gui-startup-performance.md](agent-gui-startup-performance.md) | 冷启动、splash、懒加载 |
| [agent-gui-chat-storage.md](agent-gui-chat-storage.md) | 对话历史存储 |
| [agent-gui-plugin-storage.md](agent-gui-plugin-storage.md) | 可选插件目录与下载 |
| [agent-gui-prompt-structure.md](agent-gui-prompt-structure.md) | 系统提示与 Skill 加载 |
| [agent-defs-spec.md](agent-defs-spec.md) | 工作区 `.quicker/commands|skills|agents` 规范 |
| [quicker-agent-plugin-spec.md](quicker-agent-plugin-spec.md) | QuickerAgent Plugin manifest / Host API |
| [dev-supervisor-design.md](dev-supervisor-design.md) | `dev.ps1` 监督进程设计 |
| [agent-authoring-benchmark.md](agent-authoring-benchmark.md) | 编写评测任务集（含 [测试 prompt](agent-test-prompts.txt)） |
| [voice-input-plugin.md](voice-input-plugin.md) | 语音输入 + WebSocket 协议 |
| [voxtype-quicker-integration.md](voxtype-quicker-integration.md) | VoxType × Quicker |
| [../voice-asr-runtime/README.md](../voice-asr-runtime/README.md) | 本地 ASR runtime |
| [clipboard-history-plugin.md](clipboard-history-plugin.md) | 剪贴板历史插件 |
| [../Quicker.ActionRuntime/docs/](../Quicker.ActionRuntime/docs/) | ActionRuntime 子项目工程文档 |

---

## 动作编写与深参考

| 文档 / 目录 | 说明 |
|-------------|------|
| [quicker-action-data-storage.md](quicker-action-data-storage.md) | 动作数据存储架构 |
| [action-authoring-src/](action-authoring-src/) | **源码**：指南模板与 manifest |
| [authoring-references/](authoring-references/) | **深参考**：step-modules、patterns、benchmarks |
| [authoring-references/learned-skills/](authoring-references/learned-skills/) | draft skill 晋升 registry |
| [authoring-references/action-patterns/](authoring-references/action-patterns/) | 多步编写模式 |
| [authoring-references/benchmarks/](authoring-references/benchmarks/) | 编写/agent 评测复盘 |
| [action-authoring/cli/](action-authoring/cli/) | 生成物：`qkrpc guide get` |
| [skills/quicker-authoring/](skills/quicker-authoring/) | 生成物：QuickerAgent / setup |

运行时入口：`qkrpc guide get --topic overview --json`。

---

## Agent Skills 对照

| Skill | 路径 | `qkrpc agent setup` 默认 | 说明 |
|-------|------|---------------------------|------|
| `qkrpc` | `docs/skills/qkrpc/` | 是 | CLI/MCP 用法 |
| `quicker-rpc-knowledge` | `docs/skills/quicker-rpc-knowledge/` | 是 | 架构、连不通诊断 |
| `quicker-authoring` | `docs/skills/quicker-authoring/` | 是 | 无头编写 P0–P7 |
| `quicker-eval-expression` | `docs/skills/quicker-eval-expression/` | 是 | `$=` / evalexpression |
| `quicker-run` | `docs/skills/quicker-run/` | 是 | 运行/调试动作 |
| `quicker-sync` | `docs/skills/quicker-sync/` | **否（deprecated）** | 已由 `workspace-editing` + host file tools 替代 |
| `quicker-chromecontrol` | `docs/skills/quicker-chromecontrol/` | 否 | QuickerAgent 按需加载 |
| `quicker-browser-script` | `docs/skills/quicker-browser-script/` | 否 | QuickerAgent 按需加载 |
| `quicker-rpc-build-test` 等 | `.cursor/skills/` | 否 | **仓库贡献者**专用，不进 setup |

Draft 编写 skill：`.cursor/skills/quicker-authoring-*` + [`learned-skills/registry.json`](authoring-references/learned-skills/registry.json)。

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
| [agent-rules/](agent-rules/) | 各宿主 rules 片段（如 Claude） |
| [skills/](skills/) | `qkrpc agent setup` 分发的 Skill 源码 |
| [../.cursor/skills/](../.cursor/skills/) | Cursor 仓库内贡献者 Skill |

---

## 内部设计稿（superpowers）

非最终用户文档，供维护者与 Agent 规划用：

| 目录 | 说明 |
|------|------|
| [superpowers/specs/](superpowers/specs/) | 功能/集成设计 spec |
| [superpowers/plans/](superpowers/plans/) | 实施计划 |

例如：[agent-mock-verify-loop](superpowers/specs/2026-06-13-agent-mock-verify-loop-design.md)、[action-authoring-learning](superpowers/plans/2026-06-13-quicker-action-authoring-learning.md)。

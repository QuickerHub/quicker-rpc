# 文档索引

本仓库是 **QuickerAgent**（桌面 AI 助手）、**QuickerRpc 插件** 与 **`qkrpc` CLI** 的 monorepo。

## 逻辑目录（Phase 3 索引）

物理路径暂未搬迁（嵌入路径稳定）；按角色用子目录 README 导航：

| 分区 | 索引 | 内容 |
|------|------|------|
| 产品与集成 | [product/](product/) | 用户文档、MCP/CLI、插件 |
| 工程开发 | [engineering/](engineering/) | agent-gui、dev、子项目 |
| 动作编写 | [authoring/](authoring/) | 管线 + `action-authoring-src` / `authoring-references` |
| Agent 资产 | [skills/](skills/) · [agent-rules/](agent-rules/) | setup 分发 skill / rules |
| 内部设计 | [internal/](internal/) | `superpowers/` specs & plans |

---

## 按角色选入口

| 你是谁 | 从这里开始 |
|--------|------------|
| Quicker 用户，想用 AI 找 / 跑 / 改动作 | [quicker-agent.md](quicker-agent.md) → [下载安装包](https://github.com/QuickerHub/quicker-rpc/releases/latest/download/quicker-agent-win-x64-setup.exe) |
| 在 Cursor / VS Code / Claude 等 Agent 里写动作 | [agent-mcp-integration.md](agent-mcp-integration.md)（`qkrpc agent setup`） |
| 脚本、CI、自建集成 | [cli-commands.md](cli-commands.md)、`qkrpc help --json`、`qkrpc serve` HTTP |
| 维护动作编写文档 / step 模块参考 | [authoring/README.md](authoring/README.md) → [PIPELINE.md](authoring/PIPELINE.md) |
| 贡献代码 / Coding Agent | 根 [README.md](../README.md) §开发、[AGENTS.md](../AGENTS.md) |
| 了解方向与优先级 | [ROADMAP.md](ROADMAP.md) |

---

## 我想…改/读哪里？（速查）

| 我想… | 读 / 改 | 不要改 |
|--------|---------|--------|
| 改 P1–P7 工作流、schema topic | [`action-authoring-src/`](action-authoring-src/) | `action-authoring/cli/`、`skills/.../references/` |
| 改 step 模块深文档、JSON 示例 | [`authoring-references/step-modules/authored/`](authoring-references/step-modules/authored/) | `action-authoring/cli/*.md`（生成 topic） |
| 改 Agent 默认 skill 正文 | `action-authoring-src/skills/` → `npm run docs:gen` | 直接改 `docs/skills/` 大段正文 |
| 改构建 / 发布 / 前端检查 | [`.cursor/skills/`](../.cursor/skills/) | — |
| 查 CLI 命令 | [cli-commands.md](cli-commands.md) 或 `qkrpc help --json` | — |
| 看内部设计稿 | [internal/](internal/) → `superpowers/` | 当作用户文档 |
| 运行时编写指南 | `qkrpc guide get --topic overview --json` | — |

完整管线说明：[authoring/PIPELINE.md](authoring/PIPELINE.md) · 编写入口：[authoring/README.md](authoring/README.md)。

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

索引：[product/README.md](product/README.md)

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

索引：[engineering/README.md](engineering/README.md)

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

索引：[authoring/README.md](authoring/README.md)

| 文档 / 目录 | 说明 |
|-------------|------|
| [quicker-action-data-storage.md](quicker-action-data-storage.md) | 动作数据存储架构 |
| [action-authoring-src/](action-authoring-src/) | **源码**：指南模板与 manifest |
| [authoring-references/](authoring-references/) | **深参考**：step-modules、patterns、learned-skills registry、benchmarks |
| [authoring-references/learned-skills/SPEC.md](authoring-references/learned-skills/SPEC.md) | draft skill 创建与晋升流程 |
| [authoring-references/learned-skills/registry.json](authoring-references/learned-skills/registry.json) | 当前 draft/review 子 skill 登记册 |
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
| **Scenario 子 skill**（12 个） | `docs/skills/quicker-authoring-*` 等 | **on-demand** | 父 skill Route 表；见下 |
| `quicker-chromecontrol` | `docs/skills/quicker-chromecontrol/` | 否 | QuickerAgent 按需加载 |
| `quicker-browser-script` | `docs/skills/quicker-browser-script/` | 否 | QuickerAgent 按需加载 |
| `quicker-rpc-build-test` 等 | `.cursor/skills/` | 否 | **仓库贡献者**专用，不进 setup |

### Scenario 子 skill（on-demand，2026-06 晋升）

QuickerAgent catalog 自动发现；编写时按场景加载：

| skill | 场景 |
|-------|------|
| `quicker-action-library-search` | 动作库搜索 / exemplar |
| `quicker-authoring-selection-pipeline` | 选中文本流水线 |
| `quicker-authoring-clipboard-pipeline` | 剪贴板流水线 |
| `quicker-authoring-http-json-api` | HTTP + JSON |
| `quicker-authoring-loop-control` | each / break / simpleIf |
| `quicker-authoring-evalexpression-multi-var` | 多变量 evalexpression |
| `quicker-authoring-subprogram-extract` | 子程序抽取 |
| `quicker-authoring-file-batch` | 多文件批处理 |
| `quicker-authoring-expression-first` | 表达式优先 |
| `quicker-authoring-path-and-exists` | 路径存在检查 |
| `quicker-authoring-delay-retry` | 延迟重试 |
| `quicker-authoring-ui-automation-lite` | 前台窗口 + 按键 |
| `quicker-authoring-run-action-delegate` | 委托运行动作 |

新场景子 skill：直接写 [`action-authoring-src/skills/`](action-authoring-src/skills/) → `npm run docs:gen` → `docs/skills/`；登记 [`learned-skills/registry.json`](authoring-references/learned-skills/registry.json)（见 [SPEC](authoring-references/learned-skills/SPEC.md)）。

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

索引：[internal/README.md](internal/README.md) — 非最终用户文档。

| 目录 | 说明 |
|------|------|
| [superpowers/specs/](superpowers/specs/) | 功能/集成设计 spec |
| [superpowers/plans/](superpowers/plans/) | 实施计划 |

例如：[agent-mock-verify-loop](superpowers/specs/2026-06-13-agent-mock-verify-loop-design.md)、[action-authoring-learning](superpowers/plans/2026-06-13-quicker-action-authoring-learning.md)。

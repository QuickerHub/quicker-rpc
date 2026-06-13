# 工程与开发文档

面向 **agent-gui / Electron 开发者**、**QuickerRpc 贡献者**、**Coding Agent** 的运维与设计说明。

> 逻辑分区索引：文件仍位于 `docs/` 根目录或子项目内（未物理搬迁）。

## QuickerAgent（agent-gui）

| 文档 | 说明 |
|------|------|
| [agent-gui/README.md](../../agent-gui/README.md) | 本地开发、Electron 发布、LLM 配置 |
| [agent-gui/AGENTS.md](../../agent-gui/AGENTS.md) | 改 UI 时的 Agent 约定 |
| [agent-gui-launcher.md](../agent-gui-launcher.md) | `Alt+Space` 启动器 |
| [agent-gui-startup-performance.md](../agent-gui-startup-performance.md) | 冷启动、splash、懒加载 |
| [agent-gui-chat-storage.md](../agent-gui-chat-storage.md) | 对话历史存储 |
| [agent-gui-plugin-storage.md](../agent-gui-plugin-storage.md) | 可选插件目录 |
| [agent-gui-prompt-structure.md](../agent-gui-prompt-structure.md) | 系统提示与 Skill 加载 |
| [agent-defs-spec.md](../agent-defs-spec.md) | 工作区 `.quicker/commands\|skills\|agents` |
| [dev-supervisor-design.md](../dev-supervisor-design.md) | `dev.ps1` 监督进程 |

## 评测与 Agent 资产

| 文档 | 说明 |
|------|------|
| [agent-authoring-benchmark.md](../agent-authoring-benchmark.md) | 编写评测任务集 |
| [agent-test-prompts.txt](../agent-test-prompts.txt) | 测试 prompt 列表 |

## 子项目

| 文档 | 说明 |
|------|------|
| [voice-asr-runtime/README.md](../../voice-asr-runtime/README.md) | 本地 ASR runtime |
| [Quicker.ActionRuntime/docs/](../../Quicker.ActionRuntime/docs/) | ActionRuntime 工程文档 |

## 仓库贡献

| 文档 | 说明 |
|------|------|
| [../README.md](../../README.md) | 根 README：安装、架构 |
| [../AGENTS.md](../../AGENTS.md) | Coding Agent 构建/测试约定 |
| [../.cursor/skills/](../../.cursor/skills/) | 贡献者专用 Skill（不进 setup） |

返回总索引：[docs/README.md](../README.md)

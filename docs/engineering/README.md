# 工程参考

产品当前状态和修改入口不在本目录重复维护：先查 [产品功能地图](../product/README.md) 和 [Coding Agent 路由](../agents/README.md)，再按需打开下列深参考。

## Agent 核心

| 文档 | 用途 |
|---|---|
| [agent-architecture.md](../agent-architecture.md) | 分层、turn 生命周期、AI SDK 与工具边界 |
| [agent-gui-prompt-structure.md](../agent-gui-prompt-structure.md) | system prompt、skill 与上下文块 |
| [browser-automation.md](../browser-automation.md) | 后台、内嵌与用户浏览器边界 |

## 桌面应用与数据

| 文档 | 用途 |
|---|---|
| [agent-gui/README.md](../../agent-gui/README.md) | 本地开发、Electron 与发布 |
| [agent-gui-chat-storage.md](../agent-gui-chat-storage.md) | SQLite 聊天与迁移 |
| [agent-gui-plugin-storage.md](../agent-gui-plugin-storage.md) | 安装树、用户数据、插件与模型 |
| [agent-gui-launcher.md](../agent-gui-launcher.md) | Launcher 直连、桥接与协议细节 |
| [dev-supervisor-design.md](../dev-supervisor-design.md) | `dev.ps1` 监督进程 |

## QuickerRpc

| 文档 | 用途 |
|---|---|
| [quicker-rpc-core-architecture.md](../design/quicker-rpc-core-architecture.md) | Contracts/Runtime/Transport/Host 分层 |
| [quicker-rpc-plugin-v2.md](../design/quicker-rpc-plugin-v2.md) | net10 对齐矩阵与完成门槛 |
| [mcp-output-contract.md](../mcp-output-contract.md) | MCP compact output |
| [cli-commands.md](../cli-commands.md) | CLI 人类可读参考 |

## 质量与评测

| 文档 | 用途 |
|---|---|
| [ci.md](ci.md) | PR 离线门禁、可复现安装、宿主引用边界与本地复现 |
| [agent-gui-eval.md](../agent-gui-eval.md) | 真实 Agent 生产路径评测 |
| [agent-authoring-benchmark.md](../agent-authoring-benchmark.md) | 动作编写任务集与评分 |
| `agent-gui/benchmarks/`、`lib/agent-eval/`、`lib/quickerbench/` | 可执行 fixture、runner 与断言 |

## 规则

- 功能状态只更新 `docs/product/README.md`，工程文档不维护第二张 roadmap。
- 代码入口或不变量变化时更新所属产品功能页，再更新必要的深参考。
- 已完成实施过程由测试和 Git 历史承载，不新增 plan/spec 快照。
- UI 改动遵循 `agent-gui/AGENTS.md`；插件改动遵循根 `AGENTS.md`。

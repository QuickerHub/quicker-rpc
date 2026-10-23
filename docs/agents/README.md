# Coding Agent 任务路由

> 这是任务路由的唯一入口。先按关键词只读一篇所属功能页，再进入代码；不要预读整个 `docs/`。

## 任务路由

| 任务/关键词 | 先读 | 主要代码入口 | 主要验证 |
|---|---|---|---|
| 主工作台、V2 界面、布局、主题、快捷入口、DSH 设计参考 | [工作台设计](../../agent-gui/DESIGN.md) · [WORKBENCH](../product/README.md#p-workbench) · [组合边界](../agent-architecture.md#工作台组合边界) | `components/shell/AgentWorkbenchShell.tsx`、`app/agent-workbench.css`、`lib/agent-workbench-features.ts` | 开发态 frontend check + 深浅主题/会话/面板检查 |
| 聊天、Agent loop、Ask、审批、上下文、历史、消息流 | [CHAT](../product/README.md#p-chat) | `agent-gui/lib/agent-harness/`、`agent-core/`、`components/chat/`、`lib/db/` | `test:agent-eval`、`test:context-compression` |
| 动作、子程序、workspace_program、步骤、变量、设计器、trace | [AUTHOR](../product/README.md#p-author) | `agent-gui/lib/action-editor/`、`workspace-program-*`、`QuickerRpc/src/` | `test:step-editor`、`test:tools` |
| 启动器、快捷键、快速指令、command cache、resolve direct | [LAUNCH](../product/README.md#p-launch) | `agent-gui/lib/launcher/`、`components/launcher/`、`electron/commands/launcher.mjs` | `test:launcher` |
| 文件、Grep、Shell、终端、浏览器、网页搜索、浏览器转动作 | [WORK](../product/README.md#p-work) | `workspace-*-tool*`、`shell-*`、`terminal-*`、`browser-*` | 对应单测、`test:tools` |
| 模型、API Key、Skills、Commands、Agents、task 子代理、外部 MCP 工具、mcp.json、语音、插件 | [EXT](../product/README.md#p-ext) | `llm-*`、`agent-defs/`、`agent-skills/`、`agent-mcp/`、`task-tool.server.ts`、`voice-*` | `test:tools` + 领域单测 |
| qkrpc MCP server、CLI、serve、Contracts、Transport、Runtime、net472/net10 | [RPC](../product/README.md#p-rpc) | `QuickerRpc/src/` | 对应 .NET tests；改插件后按根 AGENTS 热更新 |
| V2、net10、能力对齐、stub、capability | [V2 对齐计划](../design/quicker-rpc-plugin-v2.md) | `QuickerRpc.Plugin.V2/Adapters`、`Reflection`、Runtime tests | V2 composition/probe + 活进程验证 |
| Prompt、TurnPlan、工具选择、SDK 框架边界 | [Agent 架构](../agent-architecture.md) | `agent-core/turn-plan.ts`、`agent-harness/`、`tools.ts` | tools/eval/context tests |
| 动作编写指南、schema、step 模块知识 | [动作编写管线](../authoring/README.md) | `action-authoring-src/`、`authoring-references/` | `npm run docs:check` |
| V1 动作 YAML、program.source.yaml、yaml codec、action open/save | [AUTHOR](../product/README.md#p-author) · [动作编写管线](../authoring/README.md) | `XAction/Source/`、Console source-bundle、`action-authoring-src/workflows/program-source.md` | codec/source-bundle .NET tests + `npm run docs:check` |
| Electron 包体积、发布、插件资源 | [agent-gui README](../../agent-gui/README.md) 与 [插件存储](../agent-gui-plugin-storage.md) | `agent-gui/scripts/desktop-*`、`electron/`、`publish/` | 只在用户要求时打包 |

## 修改规则

1. 先核对功能页列出的状态和不变量，再读代码。
2. 以实现和测试为准；发现文档不符时，同一修改中修正文档。
3. 新行为进入现有功能域，不新建平行 Agent loop、工具注册表、存储源或状态源。
4. 用户可见能力或规划状态变化时，更新 [`product/README.md`](../product/README.md)。
5. 新的稳定代码入口或验证方式出现时，更新所属功能页；本路由只加关键词和链接。
6. 一次性调查、实现步骤和完成日志不放入 `docs/`。

## 状态判断

- 有代码但无主产品入口：标为“实验性”，不能写“已发布”。
- capability 关闭、feature flag=false 或返回 stub：标为“对齐中/已禁用”。
- 只有文档没有代码：标为“规划”，不得按已实现修改其它模块。
- 改 UI 后遵循 `agent-gui/AGENTS.md`，必须完成开发态前端检查。

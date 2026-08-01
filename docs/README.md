# 文档入口

本目录只维护三类长期内容：产品当前能力、Agent 修改路由、工程与协议参考。代码和测试是行为事实源；文档负责解释功能边界、修改入口和验收方式。

## 从哪里开始

| 目的 | 入口 | 内容 |
|---|---|---|
| 了解产品现在能做什么、接下来补什么 | [product/README.md](product/README.md) | 唯一产品能力与规划文档 |
| 接到代码任务，快速找到要读和要改的文件 | [agents/README.md](agents/README.md) | 按关键词路由到功能页、代码和测试 |
| 理解 Agent 分层与 turn 生命周期 | [agent-architecture.md](agent-architecture.md) | 架构约束与 AI SDK 边界 |
| 维护 Quicker 动作编写知识 | [authoring/README.md](authoring/README.md) | 文档生成管线与深参考 |
| 开发、运行或发布各子项目 | [engineering/README.md](engineering/README.md) | agent-gui、QuickerRpc、运行时与发布入口 |
| 使用 qkrpc CLI/MCP | [cli-commands.md](cli-commands.md) | 命令参考；运行时以 `qkrpc help --json` 为准 |

## 文档分层

```text
product/README.md        产品功能、当前状态、规划缺口
agents/                  Coding Agent 任务路由（只做索引，不复制正文）
engineering/             架构、存储、运行时、构建与发布参考
authoring/                动作编写文档管线
action-authoring-src/     动作编写源码
authoring-references/     step、pattern、benchmark 等深参考
skills/                   qkrpc agent setup 分发的生成/维护资产
```

根目录保留的专题文档是深参考或兼容入口，不再承担产品状态总表。产品是否可用，以 [产品能力与规划](product/README.md) 为准。

## 事实优先级

1. 可执行代码、类型和测试。
2. [`docs/product/README.md`](product/README.md) 中的当前能力与边界。
3. 架构与协议参考。
4. Git 历史、Issue 和 PR 中的一次性实施过程。

若文档与代码冲突，同一修改中更新功能页；不要再新增日期命名的实施计划、完成情况快照或平行 roadmap。

## 动作编写生成物

```text
action-authoring-src/  --docs:gen-->  action-authoring/cli/ + docs/skills/
authoring-references/  ------------>  AgentModel + QuickerAgent docs search
```

- 修改 workflow/schema：改 [`action-authoring-src/`](action-authoring-src/)。
- 修改 step 深参考：改 [`authoring-references/`](authoring-references/)。
- 不直接修改生成目录中的大段正文。
- 生成与检查：`npm run docs:gen`、`npm run docs:check`。

## 文档治理

- 新用户能力或状态变化：只更新 `product/README.md` 的所属功能域。
- 新的 Agent 修改入口：更新 `agents/README.md` 的任务路由，不复制功能说明。
- 跨模块长期约束：更新架构或协议文档。
- 一次性调查和实施过程：留在 Issue/PR/Git 历史，不进入 `docs/`。
- 移动或删除文档：同一修改中用 `rg` 修复所有引用并执行文档检查。

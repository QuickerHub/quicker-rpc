# QuickerAgent 能力定义规范

QuickerAgent 通过工作区 `.quicker/` 命名空间声明 **commands**、**skills**、**subagents**，并支持根目录 **AGENTS.md** 工作区指令。

## 目录结构

```
<workspace root>/
  AGENTS.md                 # 工作区指令（注入系统提示，最大 32KB）
  .quicker/
    commands/<name>.md      # 斜杠命令
    skills/<name>/SKILL.md  # agentskills.io 技能
    agents/<name>.md        # 子代理（task 工具）
```

用户级定义（全局，所有工作区可用）：

```
%LOCALAPPDATA%/QuickerAgent/agent-defs/
  commands/
  skills/
  agents/
```

内置 skills（仓库 `docs/skills/`，仅 skills）随 QuickerAgent 分发。

## 发现优先级

同名定义按优先级合并，高优先级覆盖低优先级：

1. **workspace** — `<cwd>/.quicker/`
2. **user** — `QuickerAgent/agent-defs/`
3. **bundled** — `docs/skills/`（仅 skills）

## Commands（斜杠命令）

文件：`.quicker/commands/<name>.md`

```yaml
---
description: 简短说明（必填）
argument-hint: "[target] [version]"   # 可选，composer 菜单提示
allowed-tools: workspace_file shell_exec   # 可选，空格分隔工具 id
model: deepseek                    # 可选，覆盖本轮 LLM 选择
---

命令正文。支持占位符：
- $ARGUMENTS — 用户输入的全部参数
- $1 .. $9 — 按空格拆分的第 n 个参数
```

用户在 composer 输入 `/name args` 发送后，服务端展开正文并包在 `<command-message>` 中交给模型；`allowed-tools` 限制该轮可用工具。

## Skills

目录：`.quicker/skills/<name>/SKILL.md`

遵循 [agentskills.io](https://agentskills.io/specification) frontmatter（`name`、`description`、`allowed-tools`、`metadata` 等）。通过 `docs` 工具 `action=get` 按需加载完整正文。

## Subagents

文件：`.quicker/agents/<name>.md`

```yaml
---
name: explore
description: 快速探索代码库结构
tools: workspace_file shell_exec docs
model: auto
---

子代理系统提示正文（Markdown）。
```

主 Agent 通过 **`task`** 工具委派：`{ "agent": "explore", "prompt": "..." }`。子代理在隔离循环中运行，不可递归调用 `task`。

系统提示中的 `## Subagents` 块列出可用子代理目录，供主 Agent 选型。

## AGENTS.md

工作区根目录或 `.quicker/AGENTS.md`（前者优先）。内容直接注入系统提示 `## Workspace instructions` 段。

## API

`GET /api/agent-defs?cwd=<path>` — 返回 commands / agents / skills 目录（composer `/` 菜单）。

## 实现位置

- 解析与发现：`agent-gui/lib/agent-defs/`
- Skills 多源合并：`agent-gui/lib/agent-skills/discover.ts`
- 系统提示注入：`agent-gui/lib/instructions.ts`
- 斜杠命令展开：`agent-gui/app/api/chat/route.ts`
- 子代理运行时：`agent-gui/lib/task-tool.server.ts`

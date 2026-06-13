# getquicker 动作库搜索与只读学习 — 规范

> **Agent 入口**：`qkrpc action library search` + `qkrpc action shared get`（**设计**见 [DESIGN.md](./DESIGN.md)）。  
> **过渡期**：CLI 未实现前，开发探针可用 `npm run search:library`；**生产 Agent 禁止直接解析 HTML**。

## 1. 分工

| 能力 | 命令 | 只读 |
|------|------|------|
| 全站动作库搜索 | `action library search` | — |
| 拉分享动作程序体（学习） | `action shared get --id <sharedActionId>` | **是** |
| 本机动作搜索 | `action list` / `action search` | — |
| 本机动作读取 | `action get --id <localActionId>` | 库动作若 `UseTemplate` 则 patch 禁止 |
| 编写新动作 | `action create` + `action patch` | local only |

## 2. 底层 URL（qkrpc 内部，非 Agent）

`https://getquicker.net/Search?keyword=…&t=SharedAction&p=…&ud=…` — 见 DESIGN §3.1。

## 3. 学习工作流

1. `action library search --keyword "<领域>" --json`
2. 选 `items[].sharedActionId`
3. `action shared get --id <sharedActionId> --return-mode full --json`
4. 解构 `compressed` → `action-patterns/`（不 patch 该 id）
5. 需要实写 → `action create` 新动作，`__pattern_learning__*` 前缀，验证后删除

## 4. 禁止

- Agent 对 `sharedActionId` / `UseTemplate` 库动作 `patch` / `workspace_program patch`
- Agent 直接 WebFetch Search 页并自行解析（应调 qkrpc API）
- 复制他人动作全文进仓库

## 5. 相关实现（仓库）

| 组件 | 路径 |
|------|------|
| 设计 | [DESIGN.md](./DESIGN.md) |
| 共享动作加载 | `DataServiceSharedActionLoader.cs` |
| 压缩 | `HeadlessActionProgramService.GetCompressed` |
| 来源判定 | `ActionItemSourceHelper.cs` |
| 开发探针脚本 | `scripts/search-getquicker-library.mjs` |

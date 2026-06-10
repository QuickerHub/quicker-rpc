# Workbench UI（第一期）设计

> 参考 [cc-haha](https://github.com/NanmiCoder/cc-haha) 右侧 `WorkbenchPanel` / `WorkspacePanel`；桌面壳仍用 Tauri，Electron 迁移为第二期。

## 目标

在 QuickerAgent 右侧工作台实现 cc-haha 风格：**统一外壳、已改动/全部双视图、多标签预览（含 Diff）**，并保留 `.quicker` 动作树与 `ActionProjectDataEditor`。

## 范围

### 第一期（本 spec）

| 包含 | 不包含 |
|------|--------|
| Git 已改动列表 + 状态徽章 | Tauri → Electron |
| 全部视图：文档目录 + 动作/子程序树 | 原生 WebContentsView 浏览器 |
| 多标签文件/Diff 预览 | Git worktree 会话隔离 |
| 追踪模式保留 | 替换 ActionProjectDataEditor |
| Server 只读 `git status` / `git diff` | 通用 cwd 懒加载文件树（可后续加） |

### 第二期

- Electron 桌面壳 + `WebContentsView` 浏览器
- 可选：通用文件树、worktree 启动

## 布局

```
┌──────────┬─────────────────────────────┬──────────────────────────┐
│ 会话侧栏  │ 聊天                         │ Workbench                 │
│          │                             │ [资源] [浏览器] [追踪]     │
│          │                             │ ─ 已改动 | 全部 ─          │
│          │                             │  列表 / 树                 │
│          │                             │ ─ 预览标签栏 ─             │
│          │                             │  编辑器 / Diff              │
└──────────┴─────────────────────────────┴──────────────────────────┘
```

- 侧栏头部沿用 `WorkspaceSidePanelTabBar`（文件/追踪标签 + 视图切换）。
- 「已改动 / 全部」为工作区内部子视图，按 `cwd` 持久化到 `explorer-prefs`。

## API

扩展现有 `GET /api/workspace`：

| op | 参数 | 返回 |
|----|------|------|
| `git-status` | `cwd` | `{ ok, state: 'ok'\|'not-repo'\|'error', changedFiles[], error? }` |
| `diff` | `cwd`, `path` | `{ ok, diff, state, error? }` |

实现：`lib/workspace-git.server.ts`，对 `cwd` 执行只读 `git -C <cwd> status --porcelain` 与 `git diff HEAD -- <path>`。

## 状态

- **多标签**：`ExplorerFileTab.id` = `file:<path>` 或 `diff:<path>`（见 `lib/workbench/preview-tab-id.ts`）。
- **打开文件**：`openFile` upsert 标签并 `focusSidePanelView(tabId)`。
- **打开 Diff**：`openDiff(path)` 新建/聚焦 `diff:` 标签，内容来自 API。
- **关闭标签**：移除单条，激活相邻标签或回到资源视图。
- 动作专用路径仍路由到 `ActionProjectDataEditor` / `ActionProjectInfoEditor`。

## 刷新

- 现有 filesystem watch SSE 触发 `refreshTree` 时，同步刷新 `git-status`。
- Agent `workspace_file` / `workspace_program` 写入后同上。

## Agent 提示词与工具路由

- `lib/workbench-agent-prompt.ts` — 系统提示 **Workbench** 段（已改动 / Diff / 勿在聊天贴全文 diff）
- `lib/tool-routing.ts` — 增补磁盘编辑、已改动审阅、`workspace_program_diagnostics` 行
- 工具 description：`workspace_file`、`workspace_program`、`shell_exec` 与 routing 表一致

## 验证

- `dev_frontend_check` 通过
- 手动：改动文件 → 已改动列表更新；点文件开 Diff；多标签切换；`data.json` 仍进动作编辑器；追踪模式正常

# Workbench UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cc-haha 风格右侧工作台：Git 已改动视图、多标签预览、保留动作树/编辑器。

**Architecture:** Server 只读 git API → `workspace-explorer` 多标签状态 → `components/workbench/*` UI → 接入 `WorkspaceResourceManager` 与 `WorkspaceExplorerEditorPane`。

**Tech Stack:** Next.js API routes, React Context, 现有 Monaco/CodeMirror、`FileEditorCard` diff 展示。

**Spec:** [2026-06-10-workbench-ui-design.md](../specs/2026-06-10-workbench-ui-design.md)

---

### Task 1: Git status server + API

**Files:**
- Create: `agent-gui/lib/workspace-git.server.ts`
- Create: `agent-gui/lib/workspace-git.server.test.ts`
- Modify: `agent-gui/app/api/workspace/route.ts`

- [ ] **Step 1:** 写 `parseGitPorcelain` / `getWorkspaceGitStatus` / `getWorkspaceGitDiff` 单元测试
- [ ] **Step 2:** 实现 server 模块
- [ ] **Step 3:** 在 `route.ts` 增加 `git-status`、`diff` op
- [ ] **Step 4:** `pnpm exec tsx --test lib/workspace-git.server.test.ts`

### Task 2: API client + 预览标签 ID

**Files:**
- Create: `agent-gui/lib/workbench/preview-tab-id.ts`
- Create: `agent-gui/lib/workbench/preview-tab-id.test.ts`
- Modify: `agent-gui/lib/workspace-explorer-api.ts`

- [ ] **Step 1:** `previewTabId` / `parsePreviewTabId` 测试
- [ ] **Step 2:** `fetchWorkspaceGitStatus` / `fetchWorkspaceDiff`
- [ ] **Step 3:** 跑测试

### Task 3: 多标签 `workspace-explorer`

**Files:**
- Modify: `agent-gui/lib/workspace-explorer.tsx`
- Modify: `agent-gui/lib/workspace-main-editor-tab.ts`

- [ ] **Step 1:** `ExplorerFileTab` 增加 `kind`、`diff?`
- [ ] **Step 2:** `openFile` upsert `file:` 标签；`openDiff` 新增
- [ ] **Step 3:** `loadFileContent` / `saveWorkspaceFile` / `closeTab` 按 path/tabId 工作
- [ ] **Step 4:** `workspaceExplorerActionsRef` 暴露 `openDiff`

### Task 4: Workbench UI 组件

**Files:**
- Create: `agent-gui/components/workbench/WorkspacePanelViewToggle.tsx`
- Create: `agent-gui/components/workbench/ChangedFilesList.tsx`
- Create: `agent-gui/lib/workbench/use-workspace-git-status.ts`
- Modify: `agent-gui/components/workspace/WorkspaceResourceManager.tsx`
- Modify: `agent-gui/lib/explorer-prefs.ts`
- Modify: `agent-gui/app/globals.css`

- [ ] **Step 1:** 视图切换 + 已改动列表 UI
- [ ] **Step 2:** hook 加载/刷新 git status
- [ ] **Step 3:** 接入 ResourceManager；watch 时刷新

### Task 5: Diff 预览

**Files:**
- Modify: `agent-gui/components/workspace/WorkspaceExplorerEditorPane.tsx`

- [ ] **Step 1:** `kind === 'diff'` 时用 `FileEditorCard` 或 unified diff 展示
- [ ] **Step 2:** 侧栏标签显示 Diff 徽章

### Task 6: 验证

- [ ] `dev_frontend_check` 直到 `ok: true`

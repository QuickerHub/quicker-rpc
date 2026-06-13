---
name: quicker-action-library-search
description: "Search getquicker action library and read shared actions for learning via qkrpc API (library search + shared get, read-only). Use when finding exemplar actions before writing Quicker actions."
allowed-tools: docs
compatibility: "QuickerAgent (on-demand); requires Quicker + QuickerRpc plugin"
---


# 动作库搜索与学习（quicker-action-library-search）

> **父 skill**：quicker-authoring · **设计**：`docs/authoring-references/getquicker-library-search/DESIGN.md`

## 何时加载

- 从**公开动作库**找标杆、学习别人怎么写
- Phase 3 pattern 蒸馏需要 exemplar
- 用户问「动作库有没有…」

## 核心原则

1. **只读学习**：分享/库动作用 `shared get` 拉取，**禁止 patch**
2. **API 出口**：走 **qkrpc**，Agent 不自己爬 HTML
3. **自己写**：`action create` 新建本地动作再 `patch`

## 推荐调用

```powershell
# 1) 搜公开库
qkrpc action library search --keyword "选中文本" --limit 10 --json

# 2) 只读拉程序体（压缩后）
qkrpc action shared get --id <sharedActionId> --return-mode full --json
# 响应含 readOnly:true, patchAllowed:false
```

MCP：`qkrpc_action_library_search`、`qkrpc_action_shared_get`。

## 本机已安装（辅助）

```powershell
qkrpc action list --query '{"filter":{"source":"library"},"keyword":"…"}' --json
qkrpc action get --id <localActionId> --return-mode full --json
# 若 source=library 且 UseTemplate → 同样禁止 patch
```

## shared get 之后

- 分析 `compressed.steps` / `variables` → pattern 文档
- **不要** `action patch` / `workspace_program` 写回 sharedActionId
- 实写验证：`action create` → patch 到 **新** localActionId → `action run --trace` → 删除

## 实现状态回退（仅 qkrpc 不可用时）

| 步骤 | 临时 |
|------|------|
| 搜索 | 开发探针 `npm run search:library -- --keyword "…" --json` |
| 拉体 | 本机已装 → `action get`；否则修复 qkrpc 连接 |

**禁止** Agent 用 WebFetch 自行解析 Search 页（解析必须在 qkrpc 内完成）。

## 硬规则

- `sharedActionId` / 库动作：**只读**，不得 patch
- 新动作写作 → **quicker-authoring** P1 create + P6 patch（local）
- 单次搜索 `--limit` ≤20，≤3 页

## 深度阅读

- `getquicker-library-search/DESIGN.md`
- `getquicker-library-search/SPEC.md`
- `docs/quicker-action-data-storage.md` §10（GetSharedActionAsync）


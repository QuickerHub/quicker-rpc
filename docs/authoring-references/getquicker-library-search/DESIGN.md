# 动作库学习 API — 设计（qkrpc 统一出口）

> **目标**：Agent **不**直接爬 [getquicker Search](https://getquicker.net/Search)；所有「搜动作库 → 拉程序体学习」走 **qkrpc API**，由插件/CLI 完成网络请求、HTML 解析（过渡期）、**XAction 压缩**，返回 **只读** JSON。  
> **写动作**：分享/库动作 **禁止 patch**；Agent 用 `action create` 新建本地动作再编辑。

## 1. 问题与原则

| 现状 | 目标 |
|------|------|
| Agent 用脚本/WebFetch 解析 Search HTML | 解析藏在 **qkrpc 内部**；Agent 只收 JSON |
| `action get` 依赖本机已安装动作 | 支持 **`sharedActionId` 直拉**（`GetSharedActionAsync` 网络/SQL） |
| patch 未区分库动作 | **library / 只读 shared get** → `patch` 拒绝 |
| 学习 vs 编辑混在一起 | **学习=只读 get**；**编辑=local 新动作** |

## 2. 架构

```text
Agent
  │  qkrpc action library search  ──►  Plugin: HTTP GET /Search (内部)
  │                                      └─► 解析 HTML → items[] JSON
  │
  │  qkrpc action shared get       ──►  Plugin: DataServiceSharedActionLoader
  │       --id <sharedActionId>          └─► body JSON → XActionProgramService.Compress
  │                                      └─► { compressed, readOnly: true }
  │
  │  qkrpc action create + patch   ──►  仅 source=local 新动作/已 fork 动作
  │
  ✗  action patch on library/shared learning copy  → 403 READ_ONLY_SHARED_ACTION
```

**与本地搜索分工**（不变）：

| 命令 | 范围 |
|------|------|
| `action library search` | **全站**公开动作库（getquicker.net） |
| `action list/search` + `filter:library` | **本机**已安装库动作 |
| `action shared get` | 按 **sharedActionId** 拉程序体（可不安装） |

## 3. API 契约（拟新增）

### 3.1 `action library search`

```powershell
qkrpc action library search --keyword "<词>" [--page 1] [--days 30] [--limit 20] [--json]
# serve: action.library.search
```

**请求（插件内部）**

```http
GET https://getquicker.net/Search?keyword={urlenc}&t=SharedAction&p={page}&ud={days}
```

> 过渡期无官方 JSON API；**HTML 解析仅在 QuickerRpc.Plugin 实现**（逻辑可复用 `scripts/search-getquicker-library.mjs`，迁为 C# 或 CLI 子进程封装）。Agent **禁止**直接调该脚本。

**响应 `payload`**

```jsonc
{
  "success": true,
  "keyword": "选中文本",
  "page": 1,
  "totalCount": 1473,
  "matchCount": 20,
  "searchUrl": "https://getquicker.net/Search?...",
  "items": [
    {
      "sharedActionId": "875ef658-5409-473f-4988-08dad5be7f8c",
      "title": "选中本行文本",
      "snippet": "通过Windows键盘快捷方式选中本行文本",
      "author": "全麦",
      "updatedAt": "2022-12-05 17:36",
      "likes": null,
      "apps": ["通用"],
      "pageUrl": "https://getquicker.net/Sharedaction?code=..."
    }
  ]
}
```

### 3.2 `action shared get`（只读学习）

```powershell
qkrpc action shared get --id <sharedActionId> [--return-mode full|structure|metadata] [--json]
# serve: action.shared.get
```

**解析 `id`**：`sharedActionId` GUID（与 `Sharedaction?code=` 相同）。

**加载链**（已有基础设施）：

1. `DataServiceSharedActionLoader.TryLoad(sharedId, revision)` — 内存 → SQL → **网络**
2. `SharedActionBodyResolver.TryGetBodyJson(dto)` — Data/Data2/Data3 合并
3. `XActionProgramService.Compress(returnMode, steps, variables, catalog)` — 与 `action get` 相同 wire

**响应 `payload`（在 `action get` 基础上扩展）**

```jsonc
{
  "success": true,
  "sharedActionId": "875ef658-...",
  "readOnly": true,
  "readOnlyReason": "SHARED_ACTION_LEARNING",
  "patchAllowed": false,
  "installedLocally": false,   // 是否在本机 Profile 有实例
  "localActionId": null,       // 若已安装则填本地 guid（仅供 run，仍不可 patch 若 UseTemplate）
  "returnMode": "full",
  "compressed": { "steps": [...], "variables": [...], "subProgramCount": 0 },
  "omitDefaultLiteralInputsApplied": true
}
```

**无 `editVersion`**（或固定 `0`）— Agent **不得**对 shared get 结果做 patch。

### 3.3 `action patch` 守卫（拟增强）

在 `HeadlessActionProgramService.PatchAction` / `ApplyXActionToAction` 入口：

| 条件 | 行为 |
|------|------|
| `ActionItemSourceHelper.IsFromActionLibrary(action) && action.UseTemplate` | **拒绝** `READ_ONLY_LIBRARY_ACTION` |
| 请求上下文为 `shared get` 学习副本（无本地 ActionItem） | 不适用 patch |
| `source=local` 或已 fork（`UseTemplate=false` 且有 Data） | 允许 patch |
| 用户自己的 `published` 且本地已编辑 | 允许 patch |

错误示例：

```json
{ "success": false, "errorCode": "READ_ONLY_SHARED_ACTION", "message": "Library/shared actions are read-only. Use action create to author a new action." }
```

### 3.4 Agent 写动作路径（不变）

```text
action create --title "..."  →  localActionId
action patch --id <localActionId>  →  仅 local / forked
action run --id <localActionId>
```

学习流程 **不得** `workspace_program patch` 到 sharedActionId。

## 4. MCP / serve 映射

| CLI | serve `op` | MCP（拟） |
|-----|------------|-----------|
| `action library search` | `action.library.search` | `qkrpc_action_library_search` |
| `action shared get` | `action.shared.get` | `qkrpc_action_shared_get` |

现有保留：

| `action get` | 本机 actionId；若库动作已安装且 `UseTemplate` 返回体可读但 **patch 应拒绝** |
| `action list` | 本机 catalog |

## 5. 实现阶段

| 阶段 | 内容 | 产出 |
|------|------|------|
| **D0** | 本文 + skill/SPEC 更新 | 设计评审 ✅ |
| **P1** | `GetSharedActionProgramCompressedAsync` + CLI + serve + patch 守卫 | 只读 shared get 可用 ✅ |
| **P2** | `SearchActionLibraryOnlineAsync`（Plugin HTTP + 解析） | `library search` 可用 ✅ |
| **P3** | MCP 工具 + `docs:gen` topic + skill 晋升 agent-gui | Agent 默认走 API（进行中） |
| **P4** | 若 getquicker 提供官方 JSON API | 替换内部 HTML 解析，契约不变 |

**脚本 `scripts/search-getquicker-library.mjs`**：P2 前可作为 **qkrpc 内部/开发探针**；P2 后 Agent skill 改指向 CLI，脚本仅单测/对照。

## 6. Agent skill 路由（目标态）

```
找公开库标杆 → quicker-action-library-search
  → qkrpc action library search
  → qkrpc action shared get --return-mode full
  → 蒸馏 action-patterns / draft sub-skill

本机已装     → qkrpc action list --filter library
编辑         → quicker-authoring P1 create + P6 patch（local only）
```

## 7. 安全与礼貌

- `library search` 默认 `--limit 20`，单次会话 ≤3 页
- `shared get` 走 Quicker 已有 `GetSharedActionAsync`（与用户客户端一致）
- 不批量镜像动作库；学习产出只链 `sharedActionId` + 自写示例

## 8. 验收

- [x] `action shared get --id <已知 sharedId> --json` 返回 `readOnly:true` + 有效 `compressed.steps`（2026-06-13：`875ef658-…`）
- [x] 对 `UseTemplate=true` 的已安装动作 `action patch` 返回 `READ_ONLY_*`（`a84ed4e1-…` → `READ_ONLY_LIBRARY_ACTION`）
- [x] `action library search --keyword 选中文本` 返回 ≥1 条 `sharedActionId`（1473 条命中，与 Search 页一致）
- [x] Agent skill 文档 **无**「Agent 自己 curl/HTML 解析」步骤（`quicker-action-library-search` 走 qkrpc API）

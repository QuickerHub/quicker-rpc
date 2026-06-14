# QuickerAgent 对话数据存储结构

本文档说明 **agent-gui（QuickerAgent）** 如何在本机保存多轮对话：存储位置、JSON 形态、线程/消息字段含义，以及哪些 UI 状态**不会**写入磁盘。

对话数据 **主存储为服务端 SQLite**（`%LOCALAPPDATA%/QuickerAgent/local/chats.db`），由本机 Next 服务（`server.js` / `pnpm dev`）通过 `/api/chat-store` 读写。Tauri 发布版与开发模式 **共用同一数据库文件**，与 WebView origin / 端口无关，**NSIS 覆盖安装与应用内更新不会删除**。

首次启动若数据库为空，会自动把 WebView `localStorage` 中的历史（v1/v2/v3 分片）**一次性导入** SQLite，之后读写只走数据库。

遗留 WebView `localStorage`（键 `agent-gui-chats` 等）仅作迁移来源与「从老版本恢复」扫描对象，不再是主存储。

实现索引：

| 模块 | 路径 |
|------|------|
| 类型与读写 | `agent-gui/lib/chat-store.ts` |
| SQLite 持久化（服务端） | `agent-gui/lib/chat-store-db.server.ts` |
| API 客户端 | `agent-gui/lib/chat-store-api.client.ts` |
| REST | `GET/PUT /api/chat-store`、`POST /api/chat-store/migrate`、`GET /api/chat-store/threads/:id/messages` |
| React 订阅 / 延迟落盘 | `agent-gui/lib/use-chat-store.ts` |
| WebView 用户数据路径（TS） | `agent-gui/lib/quicker-agent-paths.ts` |
| WebView 用户数据路径（Rust） | `agent-gui/src-tauri/src/quicker_agent_paths.rs` |
| 路径查询 API | `GET /api/settings/webview-profile`、Tauri `webview_profile_paths` |
| 消息类型与 usage 元数据 | `agent-gui/lib/chat-types.ts` |
| 运行时持久化（debounce） | `agent-gui/components/chat/Chat.tsx` |
| 用户消息编辑 / 本地草稿（内存） | `agent-gui/lib/user-message-edit.ts` |
| 中断工具修复（落盘前） | `agent-gui/lib/repair-interrupted-tool-calls.ts` |

相关：[插件与依赖资源存储](agent-gui-plugin-storage.md)（工作区、语音/剪贴板插件在 `%LOCALAPPDATA%/QuickerAgent/plugins/`，与 WebView **profile 目录分离**）。

---

## 1. 存储位置

### 1.1 逻辑层（应用读写）

| 项 | 值 |
|----|-----|
| **主介质** | SQLite：`%LOCALAPPDATA%/QuickerAgent/local/chats.db`（Windows） |
| **访问方式** | 浏览器 `fetch("/api/chat-store")`；服务端 `node:sqlite` |
| **遗留介质** | `window.localStorage`（仅迁移 / 恢复扫描） |
| **索引键** | `agent-gui-chats`（常量 `CHAT_STORAGE_KEY`）——`version: 3` 索引：线程元数据（标题、`updatedAt`、`messageCount`），**不含消息体** |
| **消息分片键** | `agent-gui-chats-thread-<threadId>`（每线程一个 blob，`{ version: 1, threadId, messages }`） |
| **备份键** | `agent-gui-chats-backup`（索引备份）、`agent-gui-chats-backup-thread-<threadId>`（线程 blob 备份；清空/删除前自动写入） |
| **遗留键** | `agent-gui-workspaces`（v1 多工作区）、v2 单体 `agent-gui-chats`（首次读取时迁移为 v3 分片） |

**懒加载与 `messageCount`（重要）**：启动时只加载 **active 线程** 的消息（`messageScope: "active"`），其余线程在内存中 `messages: []`。线程是否为空 **必须** 以索引中的 `messageCount` 判断（`isThreadEmpty`），`messageCount` 缺失（旧索引）视为「未知 → 非空」。任何用 `messages.length === 0` 判空再清理的代码都会把未加载的历史对话当垃圾删除（v0.13 曾因此在每次重启时丢失所有未在标签栏打开的侧栏历史，已修复并有回归测试 `chat-store.test.ts`）。

读写 API（生产环境）：

- `fetchChatStoreFromApi()` — 启动时 `GET /api/chat-store?scope=active`；DB 空则自动 `POST /api/chat-store/migrate` 导入 localStorage
- `scheduleSaveChatStore()` — debounce 后 `PUT /api/chat-store` 写入 SQLite
- `hydrateStoreThreadMessagesAsync()` — 切换标签/侧栏时 `GET /api/chat-store/threads/:id/messages` 懒加载消息
- `flushPendingChatStoreSave()` — `pagehide` 时强制刷盘

遗留 localStorage 读写（仅测试与迁移）：`loadChatStoreFromLocalStorage()`、`savePersistedChatStore()`。

### 1.2 物理层（磁盘）

**主库（对话）**

| 环境 | 路径 |
|------|------|
| Windows | `%LOCALAPPDATA%/QuickerAgent/local/chats.db` |
| macOS | `~/Library/Application Support/QuickerAgent/local/chats.db` |
| Linux | `$XDG_DATA_HOME/QuickerAgent/local/chats.db` |

SQLite 使用 WAL 模式；表：`chat_meta`、`chat_threads`、`chat_thread_messages`、`chat_thread_messages_backup`。

**遗留 WebView localStorage**（仅迁移源）

Tauri 使用 **WebView2**（Windows）。`localStorage` 由 Chromium **LevelDB** 存在 profile 目录下。

| 环境 | WebView 用户数据根目录 | localStorage LevelDB（Windows） |
|------|------------------------|----------------------------------|
| **Tauri 发布版 / `tauri dev`** | `%LOCALAPPDATA%\ai.quicker.agent\` | `%LOCALAPPDATA%\ai.quicker.agent\EBWebView\Default\Local Storage\leveldb\` |
| **macOS** | `~/Library/WebKit/ai.quicker.agent/` | （WebKit 内部布局，无与 Windows 相同的 leveldb 路径） |
| **开发 `pnpm dev`（系统浏览器）** | 当前浏览器自己的 profile | 与 Tauri **不共用**；源站 `http://127.0.0.1:3000` |

根目录名来自 `tauri.conf.json` 的 **`identifier`**（当前 `ai.quicker.agent`），与 `%LOCALAPPDATA%/QuickerAgent/`（插件目录）是 **两个并列目录**。

**发布升级防丢数据**（v0.13+ SQLite）：

- 对话在 `%LOCALAPPDATA%/QuickerAgent/local/chats.db`，与安装目录、WebView origin **解耦**。
- 首次升级仍会从 WebView `localStorage` 自动导入一次。
- 侧栏「从老版本恢复」继续扫描 LevelDB，合并后写入 SQLite。

**为何安装/更新不会清对话：**

- NSIS 只覆盖程序安装目录；`chats.db` 在 `QuickerAgent/local/`，就地升级不删除。
- 勿手动删除 `%LOCALAPPDATA%/QuickerAgent/local/chats.db`。

查询本机路径（无需手算）：

```powershell
# 开发 Next 服务在跑时
Invoke-RestMethod http://127.0.0.1:3000/api/settings/webview-profile

# Tauri 内（Rust invoke）
# webview_profile_paths
```

---

## 2. 顶层结构 `ChatStoreData`（内存）/ `ChatStoreIndex`（落盘索引）

落盘的 `agent-gui-chats` 是 **索引**（线程仅含元数据 + `messageCount`），消息体在各 `agent-gui-chats-thread-*` 分片：

```json
{
  "version": 3,
  "activeThreadId": "550e8400-e29b-41d4-a716-446655440000",
  "openTabIds": ["550e8400-e29b-41d4-a716-446655440000", "…"],
  "tabStripPersisted": true,
  "workingDirectory": "D:\\projects\\my-quicker-actions",
  "threads": [ /* ChatThreadMeta[]，含 messageCount，不含 messages */ ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `3` | 当前 schema；v2 单体 / v1 多工作区在加载时迁移 |
| `activeThreadId` | `string` | 当前聚焦的对话线程 UUID |
| `openTabIds` | `string[]` | 标题栏标签页中打开的线程 id，**顺序即标签顺序**；关闭标签只从这里移除，**不删除** `threads` 中的历史 |
| `tabStripPersisted` | `boolean?` | 用户是否显式改过标签栏；用于修复旧版「所有线程都进标签栏」的脏数据 |
| `workingDirectory` | `string` | 侧栏工作目录；**空字符串**表示使用默认 cwd（开发：仓库根；发布：`Documents/QuickerAgent/workspace`） |
| `threads` | `ChatThread[]` | 全部对话线程（含已关闭标签、侧栏历史） |

约束与策略（见 `chat-store.ts`）：

- 至少保留 **一个** 线程；空线程最多保留 **一个**（`compactEmptyThreads`）
- 标题栏最多 **8** 个打开标签（`MAX_OPEN_CHAT_TABS`），超出时按规则关闭非激活的空标签或最久未更新的标签
- 关闭标签 ≠ 删除对话；删除仅在侧栏「删除对话」时从 `threads` 移除

---

## 3. 线程 `ChatThread`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "新建动作：变量 path 默认空…",
  "messages": [ /* AgentUIMessage[] */ ],
  "updatedAt": 1710000000000,
  "titleGenerated": true,
  "titleManual": false
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | UUID（`crypto.randomUUID()` 或降级随机 id） |
| `title` | `string` | 侧栏 / 标签显示标题；新建默认为 `"新对话"` |
| `messages` | `AgentUIMessage[]` | 完整对话 transcript（见 §4） |
| `updatedAt` | `number` | 最后消息变更时的 Unix 毫秒时间戳 |
| `titleGenerated` | `boolean?` | 是否已应用 LLM/工具生成的标题 |
| `titleManual` | `boolean?` | 用户是否在侧栏手动重命名；为 `true` 时跳过自动改标题 |
| `messageCount` | `number?` | 索引中的持久化消息数；懒加载下判空的唯一依据，缺失视为非空（见 §1.1） |

标题来源：

1. 首条用户消息后：`deriveProvisionalThreadTitle` 生成临时标题并写入 `title`
2. Agent 调用 `set_thread_title` 工具：`updateThreadTitle` 写入并设 `titleGenerated: true`
3. 用户重命名：`renameThread` 设 `titleManual: true`

---

## 4. 消息 `AgentUIMessage`

类型定义为 AI SDK 的 `UIMessage`，并挂载 usage 元数据：

```ts
type AgentUIMessage = UIMessage<ChatUsageMetadata>;
```

### 4.1 公共字段

| 字段 | 说明 |
|------|------|
| `id` | 消息 UUID |
| `role` | `"user"` \| `"assistant"` \| `"system"`（UI 以 user/assistant 为主） |
| `parts` | **内容主体**：文本、工具调用、工具结果等（见 §4.2） |
| `metadata` | 可选；assistant 消息上常见 token 统计与上下文压缩信息（见 §4.3） |

用户可见文本来自 `parts` 中 `type: "text"` 的片段拼接（见 `getUserMessageDisplayText`）。Composer 里的 `@动作` 等以 markup 形式存在 text part 中。

### 4.2 `parts` 常见类型（AI SDK）

持久化时 **原样序列化** 整个 `parts` 数组，例如：

**用户消息**

```json
{
  "id": "…",
  "role": "user",
  "parts": [{ "type": "text", "text": "_test_action 做某事" }]
}
```

**助手消息（文本 + 工具）**

```json
{
  "id": "…",
  "role": "assistant",
  "parts": [
    { "type": "step-start" },
    { "type": "text", "text": "正在搜索动作…" },
    {
      "type": "tool-qkrpc_action_search",
      "toolCallId": "call_…",
      "state": "output-available",
      "input": { "query": "词频" },
      "output": { "ok": true, "…": "…" }
    }
  ],
  "metadata": {
    "model": "gpt-5.5",
    "inputTokens": 1200,
    "outputTokens": 340,
    "totalTokens": 1540
  }
}
```

工具 part 的 `type` 一般为 `tool-<toolName>` 或 dynamic tool；`state` 随生命周期变化，例如：

- `input-streaming` / `input-available` — 进行中
- `approval-requested` — 等待用户批准破坏性操作
- `output-available` — 成功
- `output-error` / `output-denied` — 失败或拒绝

用户停止生成时，`repairInterruptedToolCalls` 会把未完成的 tool part 修成 `output-error` 或 `output-denied` 后再持久化。

### 4.3 `metadata`（`ChatUsageMetadata`）

仅 assistant 消息使用，字段均可选：

| 字段 | 说明 |
|------|------|
| `model` | 实际模型 id |
| `inputTokens` / `outputTokens` / `totalTokens` / `reasoningTokens` | 用量统计 |
| `contextCompression` | 长上下文压缩摘要（见下） |
| `launcherCacheDirect` / `launcherResolveDirect` | 小窗/启动器路径标记 |
| `resolveQuery` | 启动器解析查询 |

`contextCompression` 结构：

```json
{
  "summary": "此前对话摘要…",
  "throughMessageId": "msg-id-before-compression",
  "sourceInputTokens": 80000,
  "createdAt": 1710000000000,
  "recentMessagesKept": 12,
  "totalMessagesAtCreation": 48,
  "recentTokensEstimate": 52000,
  "splitReason": "token_budget",
  "microcompactApplied": true,
  "summaryReused": false,
  "reactiveCompactAttempted": false,
  "reinjectPaths": ["actions/demo/data.json"]
}
```

| 字段 | 含义 |
|------|------|
| `splitReason` | `none` / `token_budget` / `usage_fallback` |
| `microcompactApplied` | 是否在 split 前对旧 round 大 tool 输出做了占位压缩 |
| `summaryReused` | 是否复用了上一条 assistant 上的摘要（零额外 LLM 调用） |
| `reactiveCompactAttempted` | provider 返回 context length 错误后，服务端是否已 force 重试压缩 |
| `reinjectPaths` | 压缩后从 workspace 重新注入 system 的文件路径 |

压缩发生后，旧消息可能仍保留在 `messages` 数组中供 UI 展示，但发给模型的上下文会按服务端逻辑截断/摘要（见 `agent-gui/lib/context-compression.ts`、`context-compression-reactive.ts` 与 `/api/chat`）。

---

## 5. 持久化时机

```
useChat (AI SDK) messages 变更
    → ChatPanel debounce（空闲 400ms；流式最长 5s 一次）
    → flushThreadPersist
    → updateThreadMessages(store, threadId, messages)
    → updateStore → scheduleSaveChatStore
    → localStorage["agent-gui-chats"]（WebView LevelDB 落盘）
```

| 场景 | 行为 |
|------|------|
| 普通编辑 / 一轮结束 | debounce **400ms** 后写入 |
| `streaming` / `submitted` | debounce 延长为 **5s**；另每 **5s** interval 强制快照 |
| 流式结束（`ready` / `error`） | 立即 `flushThreadPersist` |
| 标签切换 / 组件卸载 | timer cleanup 时 flush |
| `pagehide` | `flushPendingChatStoreSave` + 线程级 flush |

`updateThreadMessages` 在 `JSON.stringify` 相同时跳过写入，避免无意义刷新。

**不持久化**（仅内存 / 其他键）：

| 数据 | 说明 |
|------|------|
| `userMessageDrafts` | 点击用户消息编辑、尚未发送的本地草稿 |
| `editAnchorMessageId` / 分支编辑态 | 从某条消息「继续编辑」时的 UI 状态 |
| `expandedColdTurns` | 消息列表虚拟化：哪些「冷轮次」已展开 |
| **Ephemeral launcher 线程** | 小窗一次性会话：`onPersist={() => {}}`，不写 store |
| Composer 输入框当前文字 | 未发送前不在 `messages` 里 |

---

## 6. 对话轮次（Turn）与 UI 虚拟化

逻辑层不单独存「轮次」表；**一轮 = 从一条 `role:user` 消息到下一轮 user 之前**的所有消息。

- `userTurnStarts: number[]` — 运行时从 `messages` 推导的用户消息下标
- UI 为性能只 **挂载最近 N 轮** DOM，上滚时增量加载更早轮次（`useChatMessageWindow`）
- 窗口内较老的轮次可先以 **折叠占位** 展示，滚入视口后自动展开（`useAutoExpandColdTurns`）

这些策略 **不改变** `localStorage` 中的 `messages` 数组，仅影响渲染。

---

## 7. 关联的其它 `localStorage` 键

与对话内容 **分键存储** 的 UI / 偏好（节选）：

| 键 | 用途 |
|----|------|
| `agent-gui-llm-selection` | 当前模型选择 |
| `agent-gui-chat-mode` | Agent / 普通模式 |
| `agent-gui-sidebar-collapsed` | 侧栏折叠 |
| `agent-gui-explorer-*` | 工作区侧栏宽度、打开状态等 |
| `agent-gui-tool-approval` | 工具自动批准规则 |
| `launcher-llm-selection` | 小窗独立模型选择 |

工作目录 **`workingDirectory`** 在 v2 中属于 `ChatStoreData` 本身，不是独立键。

上述键与 `agent-gui-chats` 一样，在 Tauri 中均落在 **同一 WebView profile** 的 LevelDB 中。

**设置 → 模型** 里的 API Key / Profile 写在 `%LOCALAPPDATA%/QuickerAgent/local/llm-secrets.json`（不在安装目录）；见 [agent-gui-plugin-storage.md §6](agent-gui-plugin-storage.md)。

---

## 8. 遗留迁移（v1 → v2）

旧版 `agent-gui-workspaces` 结构：

- 多个 `workspaces[]`，各含 `rootPath` 与 `threads`
- 迁移时 **按 thread.id 去重**，保留 `updatedAt` 较新的一份
- 合并为单一 `threads` 列表 + 一个 `workingDirectory`（取自原 active workspace 的 `rootPath`）
- 成功后写入 `agent-gui-chats`，旧键不再读取

---

## 9. 完整最小示例

```json
{
  "version": 2,
  "activeThreadId": "a1b2c3d4-0000-4000-8000-000000000001",
  "openTabIds": ["a1b2c3d4-0000-4000-8000-000000000001"],
  "tabStripPersisted": true,
  "workingDirectory": "",
  "threads": [
    {
      "id": "a1b2c3d4-0000-4000-8000-000000000001",
      "title": "新对话",
      "updatedAt": 1710000000000,
      "titleGenerated": false,
      "titleManual": false,
      "messages": [
        {
          "id": "msg-u1",
          "role": "user",
          "parts": [{ "type": "text", "text": "列出剪贴板相关动作" }]
        },
        {
          "id": "msg-a1",
          "role": "assistant",
          "parts": [
            { "type": "text", "text": "好的。" },
            {
              "type": "tool-qkrpc_action_search",
              "toolCallId": "call_1",
              "state": "output-available",
              "input": { "query": "clipboard" },
              "output": { "ok": true }
            }
          ],
          "metadata": {
            "model": "gpt-5.5",
            "inputTokens": 500,
            "outputTokens": 120,
            "totalTokens": 620
          }
        }
      ]
    }
  ]
}
```

---

## 10. 调试与导出

| 方式 | 说明 |
|------|------|
| **DevTools** | Application → Local Storage → 源 `http://127.0.0.1:…` → 键 `agent-gui-chats`（可直接复制 JSON） |
| **路径 API** | `GET /api/settings/webview-profile` 或 Tauri `webview_profile_paths` |
| **Windows 磁盘** | `%LOCALAPPDATA%\ai.quicker.agent\EBWebView\Default\Local Storage\leveldb\`（LevelDB 二进制，勿手改） |

无内置「导出对话」菜单时，在 DevTools 复制 `agent-gui-chats` 的值做备份；恢复时粘贴回同键（需保持合法 JSON 与 `version: 2`）。

**注意**：`pnpm dev` 用 Chrome/Edge 打开时，对话存在 **该浏览器 profile**，与安装版 Tauri **不互通**。要在安装版保留历史，请使用 Tauri 包运行。

### 10.1 侧栏「从老版本恢复…」

会 **依次扫描**：

1. 当前页面 `localStorage`（含 `agent-gui-workspaces`、备份键）
2. 本机已知 WebView **LevelDB** 目录（从二进制中搜索 `agent-gui-chats` / `agent-gui-workspaces` JSON，**不依赖 origin**）：
   - `%LOCALAPPDATA%\ai.quicker.agent\EBWebView\Default\Local Storage\leveldb\`
   - `%LOCALAPPDATA%\QuickerAgent\EBWebView\…`（若存在）
   - `%LOCALAPPDATA%` 下名称含 `quicker` / `agent` 的其它 profile
   - Tauri 安装版还会扫描 `{安装目录}\.WebView2\…`

API：`POST /api/chat-store/scan-legacy`；Tauri：`legacy_chat_store_scan`。

**仍无法恢复的情况**：对话只在 **系统浏览器**（非 Tauri WebView）且从未写入上述目录；此时需在原浏览器 DevTools 导出 JSON。

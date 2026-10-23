# QuickerAgent 对话存储

> 状态：当前技术参考。产品行为入口见 [CHAT](product/README.md#p-chat)。

## 当前事实

- 默认主存储是 `%APPDATA%/QuickerAgent/agent.db`；显式 profile 时为 `<data-dir>/agent.db`。
- 数据库由 `better-sqlite3` + Drizzle 管理，启用 WAL 和 foreign keys。
- `localStorage` 只用于浏览器测试降级、UI 偏好和旧版本聊天迁移，不是生产聊天主存储。
- 安装目录内旧 `.local` 数据会迁移到用户数据目录；升级安装不应删除数据库。
- Launcher 临时会话不写入数据库。

数据库路径以 `agent-gui/lib/db/client.ts::resolveAgentDatabasePath()` 为准，不在文档中维护第二套路径计算。

## 资料根与写入者归属

`QUICKER_AGENT_DATA_DIR` 选择绝对资料根；独立 Node CLI 的 `--data-dir` 优先。
启动时固定 profile，进程内不能切换。未设置时保留原平台默认与 legacy 迁移；显式 profile
不扫描或复制默认 AppData、安装 `.local`、旧插件或 WebView 历史，仅兼容该根内已有 JSON。
安装资源与用户资料分开，选择资料根不移动或清空已有内容。

`db/client.ts` 先取得 `<canonical-db-path>.writer.sqlite` 的独占租约，再复制旧库、打开实际
数据库和执行 migration。通用设置目录迁移跳过 `agent.db` / `chats.db` 及其 sidecar；数据库
仅由持租约的 client 导入，保持旧 `agent.db` 来源优先级。实际数据库使用规范化路径，拒绝
hardlink；租约 sidecar 不接受别名。Next HMR 共用同一进程 owner，不能另开一个连接绕开租约。

租约是独立 SQLite 文件中的持续 EXCLUSIVE 事务，业务库仍使用 WAL。第二个新版 writer
立即返回 `AGENT_DATABASE_WRITER_BUSY`，不先执行迁移；先关闭业务库再释放租约，初始化或
关闭失败不发布半初始化连接。进程退出后 OS 释放锁，不用 PID 猜测归属或删除旧锁文件。
sidecar 保留在磁盘，运行时不得删除或改名。本机制要求所有 writer 遵守约定，旧二进制或外部
SQLite 工具直接写业务库不会被 sidecar 阻止；验证范围是本地文件系统。

锁语义依据 [SQLite EXCLUSIVE transaction](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions)
与 [connection close rollback](https://www.sqlite.org/c3ref/close.html)。生成 fixture 已覆盖竞争、
初始化/关闭失败和强杀后重开；未用真实用户库或桌面安装包作为测试资料。

## 数据模型

| 表/键 | 内容 | 实现 |
|---|---|---|
| `chat_meta` | 当前线程、打开标签、工作区等顶层状态 | `lib/db/schema.ts` |
| `chat_threads` | 线程标题、更新时间、工作目录、Designer 上下文等元数据 | `lib/db/schema.ts` |
| `chat_thread_messages` | 每个线程的 AI SDK `UIMessage[]` JSON | `lib/db/schema.ts` |
| `chat_thread_messages_backup` | 消息写入保护/备份 | repository 与 migration |
| `app_kv` | 模型、Launcher cache 等应用配置 | `lib/db/app-kv.ts` |

内存模型仍使用 `ChatStoreData`/`ChatThread`，消息类型为 `AgentUIMessage = UIMessage<ChatUsageMetadata>`。usage、context compression 和 runtime metadata 保存在 assistant message metadata 中。

## 读写流程

```text
Chat.tsx / useChatStore
  -> /api/chat-store
  -> chat-store-db.server.ts
  -> db/chat-store.repository.ts
  -> Drizzle + better-sqlite3
  -> %APPDATA%/QuickerAgent/agent.db
```

| API | 作用 |
|---|---|
| `GET /api/chat-store?scope=active|all|none` | 读取索引和指定范围消息 |
| `PUT /api/chat-store` | 保存当前 store，启用防误清空检查 |
| `GET /api/chat-store/threads/:id/messages` | 懒加载单线程消息 |
| `POST /api/chat-store/migrate` | 导入或合并旧完整 store |
| `POST /api/chat-store/scan-legacy` | 扫描可恢复的旧 WebView/localStorage 数据 |

默认只加载活动线程消息，其余线程先加载元数据，需要时再取消息，避免启动时读取全部历史。

## 迁移与安全

1. 首次 Drizzle migration 前，已有旧数据库会创建 pre-Drizzle backup。
2. 旧 schema 缺列时由 `lib/db/legacy-schema.ts` 做兼容补齐。
3. 旧 JSON/app-local 配置通过 `app_kv` seed 迁移。
4. 旧 localStorage 聊天只能通过 migrate/scan 导入；生产保存不会回写 localStorage。
5. `ChatStoreSaveWouldWipeError` 阻止空视图、部分懒加载视图或异常请求覆盖已有消息。
6. 导入已有数据库时默认跳过；只有显式 merge 才合并消息。

## 不持久化内容

- Composer 尚未发送的文字。
- 用户消息的临时编辑草稿和分支编辑 UI 状态。
- 消息窗口虚拟化/折叠状态。
- Launcher ephemeral session。
- 只影响页面布局的瞬时 React state。

## 修改入口

| 想改 | 必须同步检查 |
|---|---|
| DB schema | `lib/db/schema.ts`、`drizzle/migrations/`、legacy patch、backup |
| 线程/消息结构 | `lib/chat-store.ts`、repository、API client、导出/迁移 |
| 加载策略 | message scope、线程级 messages API、hydration tests |
| 保存策略 | debounce/flush、repository dirty detection、防误清空 |
| 用户数据路径 | `quicker-agent-paths.ts`、persisted-data migration、Electron 打包 |

## 验证

```powershell
cd agent-gui
pnpm exec tsc --noEmit
pnpm exec tsx --test lib/chat-store*.test.ts lib/db/*.test.ts lib/chat-thread-export*.test.ts
```

影响 UI 恢复、迁移入口或线程切换时，再执行主页面开发态前端检查。

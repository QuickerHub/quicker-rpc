# QuickerAgent 启动器设计

> 面向维护者与产品：说明 **快速输入启动器**（Launcher）的定位、架构、执行链路与持久化。实现分布在 `agent-gui/lib/launcher/`、Tauri 宿主、`QuickerRpc.Plugin` 与 `qkrpc launcher resolve`。

## 1. 定位

启动器是 QuickerAgent 的 **全局快捷键轻量入口**，与主窗口 **Agent 模式** 刻意分工：

| 维度 | 启动器（Launcher） | 主 Agent |
|------|-------------------|----------|
| 唤起 | `Alt+Space`（Tauri 全局快捷键，可改） | 主窗口 / 托盘 |
| 界面 | 透明置顶小窗，固定高度，输入框常驻底部 | 完整侧栏 + 对话历史 |
| 目标 | **立即执行**：打开设置、运行动作、改元数据、常用操作 | 多步编写、磁盘 patch、发布 |
| 回复 | 一句短结果，不暴露工具名 / CLI / JSON | 完整协作与长上下文 |
| 对话 | **临时会话**，关闭小窗即清空，不写 `agent-gui-chats` | 持久化线程 |
| 工具集 | `LAUNCHER_TOOL_IDS`（固定子集，最多 12 步） | 用户可配置的全量工具 |
| 系统提示 | `LAUNCHER_SYSTEM_INSTRUCTIONS` | `SYSTEM_INSTRUCTIONS` + authoring skill |

**一句话**：像 Raycast / Alfred 一样「说来就做」，但执行域深度绑定 Quicker（设置 intent、动作库、子程序），而不是通用启动器。

---

## 2. 用户体验流程

```
用户按全局快捷键（默认 Alt+Space）
    → Tauri 显示透明浮窗 / 浏览器模式打开 /launcher 弹窗
    → 输入框自动聚焦（可选：自动开始语音输入）
    → 用户输入自然语言 或 @ 引用动作标签
    → 小窗通过 BroadcastChannel 把提交交给主窗口 Chat 引擎
    → 主窗口以 chatMode=launcher 调用 /api/chat
    → 结果流式回传小窗 LauncherTranscript
    → 用户 Esc / 失焦隐藏小窗；会话不持久化
```

### 2.1 输入方式

- **文字**：`ComposerMarkupField`，`Enter` 发送；支持 `<qka id="uuid">` 动作标签（`@` 选择器）。
- **语音**：Composer 内 `Ctrl+Shift+V`（与主窗口一致）；Tauri 可勾选 **自动语音输入**——用启动快捷键唤起后约 80ms 自动开麦。
- **模型**：独立 `launcher-llm-selection`（localStorage），默认走 **Auto** 分组；不随主窗口模型切换。

### 2.2 设置入口

**设置 → 启动器**（`LauncherSettingsSection`）：

| 项 | 存储键 | 说明 |
|----|--------|------|
| 启动快捷键 | `launcher-global-shortcut` | 默认 `Alt+Space`；仅 Tauri 注册系统级快捷键 |
| 自动语音输入 | `launcher-auto-voice` | 唤起时自动 `global:voice-toggle` |

浏览器开发模式无全局快捷键，可用主界面入口打开 `/launcher` 弹窗调试。

---

## 3. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│ Tauri 宿主 (src-tauri/)                                          │
│  global_shortcut → launcher_show → WebViewWindow /launcher       │
│  透明、置顶、skip_taskbar、固定尺寸                                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │ 加载 Next /launcher 路由
┌───────────────────────────▼─────────────────────────────────────┐
│ LauncherPanel (components/launcher/)                           │
│  LauncherComposer ──postLauncherSubmit──┐                      │
│  LauncherTranscript ← session-sync ─────┤                      │
└─────────────────────────────────────────┼──────────────────────┘
                                          │ BroadcastChannel
                                          │ quicker-agent-launcher-v1
┌─────────────────────────────────────────▼──────────────────────┐
│ 主窗口 Chat.tsx                                                   │
│  subscribeLauncherBridge → 创建 ephemeral thread → useChat        │
│  postLauncherSessionSync / tool-output / approval-respond       │
└───────────────────────────┬──────────────────────────────────────┘
                            │ POST /api/chat  chatMode=launcher
┌───────────────────────────▼──────────────────────────────────────┐
│ 服务端 route.ts                                                   │
│  ① tryRespondWithLauncherCacheDirect   (≥85% 短语匹配)           │
│  ② tryRespondWithLauncherResolveDirect (高置信 resolve)          │
│  ③ 否则 → LLM + LAUNCHER_TOOL_IDS + launcher 专用 system         │
└───────────────────────────┬──────────────────────────────────────┘
                            │ qkrpc serve / CLI
┌───────────────────────────▼──────────────────────────────────────┐
│ QuickerRpc.Plugin                                                 │
│  LauncherResolveService — 设置 / 动作 / 子程序统一打分              │
│  QuickerSettingsUiService — 设置 intent、open preset             │
│  ActionSearchService / SubProgramSearchService                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.1 双窗口桥接

小窗 **不直接** 调 `/api/chat`，而是与 **已运行的主 QuickerAgent 窗口** 协作：

| 消息类型 | 方向 | 作用 |
|----------|------|------|
| `composer:submit` | 小窗 → 主窗 | 文本 + `sessionId` + `llmSelection` |
| `agent:session-sync` | 主窗 → 小窗 | 消息列表、状态、待审批数 |
| `launcher:tool-output` | 小窗 → 主窗 | 客户端工具输出（如 `ask_question` 作答） |
| `launcher:approval-respond` | 小窗 → 主窗 | 破坏性操作批准/拒绝 |
| `launcher:opened` / `launcher:session-clear` | 双向 | 唤起时清空小窗 transcript |

实现：`agent-gui/lib/launcher/launcher-bridge.ts`。主窗为每次提交创建 **ephemeral launcher 线程**（`onPersist={() => {}}`），详见 [agent-gui-chat-storage.md §5](agent-gui-chat-storage.md)。

若主窗口未运行，小窗提交无法执行——产品假设 QuickerAgent 托盘常驻。

---

## 4. 执行链路（延迟优化）

每次 launcher 请求在调用 LLM **之前** 尝试两条 **直连快路径**（`route.ts`）：

```
用户最后一句话
    │
    ├─① command cache direct
    │     findDirectLauncherCacheMatch (score ≥ 85)
    │     且所有 step 无需 needsApproval
    │     → 直接 executeQuickerToolDirect，metadata.model = "launcher-cache"
    │
    ├─② resolve direct
    │     resolveLauncherCandidates → top.score ≥ 900
    │     且与第二名分差 ≥ 80，且有 suggestedTool
    │     → 单步直连，metadata.model = "launcher-resolve"
    │
    └─③ LLM Agent
          launcher_resolve（若含糊）→ 执行工具链
          成功后 agent 可 launcher_command_cache save
```

### 4.1 为何分层

| 路径 | 典型场景 | 用户感知 |
|------|----------|----------|
| Cache direct | 用户重复说「打开动作回收站」 | 秒回，无 token 消耗 |
| Resolve direct | 内置高置信设置 intent（如「打开功能快捷键」） | 快，跳过 planner |
| LLM | 「运行剪贴板相关动作」等模糊意图 | 需消歧，允许短工具链 |

直连响应在 assistant `metadata` 上标记 `launcherCacheDirect` / `launcherResolveDirect`；`chat-auto-submit` 不会对这类消息自动续跑 tool loop。

---

## 5. 意图解析（launcher_resolve）

### 5.1 插件侧

`QuickerRpc.Plugin/Services/LauncherResolveService.cs` 对同一 `query` 并行收集候选并打分排序：

| scope | 来源 | kind 示例 |
|-------|------|-----------|
| `settings` | `QuickerSettingsUiService.ResolveIntent`、设置直达链接目录 | `settings-intent`, `settings-preset`, `settings-page` |
| `actions` | `ActionSearchService` | `action` |
| `subprograms` | `SubProgramSearchService` | `subprogram` |

每个候选携带 `suggestedTool` + `suggestedInput`，供 Agent 或 resolve-direct 一步执行。

RPC：`IQuickerRpcService.ResolveLauncherIntentAsync`  
CLI：`qkrpc launcher resolve --query "…" [--scopes settings,actions] [--limit 12] [--json]`

### 5.2 Agent 侧 preset 加权

`launcher-resolve-core.ts` 在 RPC 结果上应用 **preset 规则**（`launcher-resolve-presets.ts`）：

- 内置规则：含「设置/打开」→ 提升 settings 类；含「运行/执行」→ 提升 action；含「子程序」→ 提升 subprogram。
- 用户可覆盖/扩展：`%LOCALAPPDATA%/QuickerAgent/local/launcher-resolve-presets.json`（开发期 `agent-gui/.local/`）。

工具输出压缩为 `LauncherResolveAgentOutput`：`next`（首选一步）+ 可选 `alternatives`（分差小于 `LAUNCHER_RESOLVE_AMBIGUITY_SCORE_GAP` 时）。

### 5.3 Resolve direct 门槛

`launcher-resolve-agent-output.ts`：

- `LAUNCHER_RESOLVE_DIRECT_MIN_TOP_SCORE = 900`
- `LAUNCHER_RESOLVE_DIRECT_MIN_SCORE_GAP = 80`
- 候选必须有 `suggestedTool`

---

## 6. 指令缓存（launcher_command_cache）

Agent 在 **稳定成功的一次性映射** 后应 `launcher_command_cache` `action=save`，把用户短语绑定到工具步骤序列。

### 6.1 数据结构

持久化于 `%LOCALAPPDATA%/QuickerAgent/local/launcher-command-cache.json`：

```json
{
  "entries": [
    {
      "id": "…",
      "trigger": "打开动作回收站",
      "aliases": ["动作回收站"],
      "steps": [
        { "toolName": "quicker_settings", "input": { "action": "open", "preset": "…" } }
      ],
      "useCount": 3,
      "lastUsedAt": "…"
    }
  ]
}
```

### 6.2 匹配与直连

`launcher-command-cache-core.ts`：

- 短语规范化（中英文标点、`<qka>` 剥离）
- `scoreLauncherCommandMatch`：完全相等 100；包含关系 85；token 全匹配 70；否则按比例
- **直连阈值**：`LAUNCHER_COMMAND_CACHE_DIRECT_MIN_SCORE = 85`
- 需 `canDirectExecuteLauncherCacheEntry`：任一步 `needsApproval` 则不走直连

### 6.3 Prompt 注入

Launcher 模式下 `buildLauncherCommandCachePromptBlock` 把近期缓存条目摘要注入 system，供 LLM 复用（非直连时）。

---

## 7. 工具边界

定义于 `agent-gui/lib/chat-mode.ts` → `LAUNCHER_TOOL_IDS`。

**包含**（操作向）：

- `launcher_resolve`、`launcher_command_cache`
- `qkrpc_action_*`（含 run / debug / float / edit / metadata / move / publish / delete）
- `qkrpc_subprogram_*`、`qkrpc_profile_*`、`qkrpc_process_ensure`
- `quicker_settings`、`qkrpc_fa`、`web_search`、`browser`
- `docs`、`ask_question`、`workspace_file`、`shell_exec`

**刻意排除**（留给主 Agent）：

- `workspace_program` — 磁盘程序体编写
- `qkrpc_step_runner_*` — 步骤模块 schema
- `dev_frontend_check`、`llm_settings` — 开发 / 模型配置

步数上限：`LAUNCHER_MAX_STEPS = 12`（Agent 为 25）。

系统提示强调：`launcher_resolve` 含糊时调用一次 → 执行；成功后可 cache；**Out of scope** 多步编写应引导用户打开主 QuickerAgent。详见 [agent-gui-prompt-structure.md §Launcher](agent-gui-prompt-structure.md)。

---

## 8. 语音与多模态

| 能力 | 状态 | 说明 |
|------|------|------|
| 流式语音识别 | 已实现 | `useVoiceInput` + Quicker 语音插件 |
| 全局语音切换 | 已实现 | `useGlobalVoiceToggle`，唤起时 `postLauncherOpened` 聚焦 |
| 启动快捷键自动开麦 | 已实现 | Tauri `auto_voice` + `global:voice-toggle` 事件 |
| 语音结束自动提交 | 未实现 | 规划中 |
| TTS 结果播报 | 未实现 | 规划中 |

小窗隐藏时 `useLauncherTauriHidden` 会 `interruptVoiceInput`，避免后台占麦。

---

## 9. 持久化与隐私

| 数据 | 位置 | 说明 |
|------|------|------|
| Launcher 对话 | **不持久化** | ephemeral thread |
| 模型选择 | `localStorage` `launcher-llm-selection` | 与主窗 `agent-gui-llm-selection` 分离 |
| 快捷键 / 自动语音 | `localStorage` | 见 §2.2 |
| resolve presets | `…/local/launcher-resolve-presets.json` | 用户加权规则 |
| command cache | `…/local/launcher-command-cache.json` | 学到的指令 |

应用数据目录与迁移规则：[agent-gui-plugin-storage.md §6](agent-gui-plugin-storage.md)。

---

## 10. 测试与回归

**Tool-test 面板**（`/tool-test`）提供独立子页：

- Launcher resolve 干跑（RPC 候选列表）
- Launcher agent 端到端（`chatMode=launcher` + 场景断言）

内置场景 `tool-test-launcher-scenarios.ts` 示例：

| id | 用户说法 | 期望首工具 |
|----|----------|------------|
| `open-hotkeys` | 打开功能快捷键设置 | `launcher_resolve` |
| `open-recycle-bin` | 帮我打开动作回收站 | `launcher_resolve` |
| `run-action-vague` | 运行剪贴板相关动作 | `launcher_resolve` |

扩展场景时应同时考虑 resolve-direct / cache-direct 是否应覆盖。

---

## 11. 设计原则

1. **快于全功能 Agent**：能直连就不调 LLM；能单步 resolve 就不多轮 planner。
2. **域专精**：优先 Quicker 设置 intent 与动作库，不做通用 OS 启动器。
3. **安全默认**：破坏性工具保留 `needsApproval`；cache direct 跳过需审批步骤。
4. **不污染主对话**：小窗会话 ephemeral，避免快捷键操作刷屏历史。
5. **主窗必须常驻**：桥接架构依赖单例 Chat 引擎；托盘退出会切断小窗执行能力。
6. **透明失败**：qkrpc 未连接时简短报错，禁止 launcher 内 `shell_exec` 探活绕路（与 `instructions.ts` 一致）。

---

## 12. 产品叙事与演示场景（对外）

**定位语**：全局快捷键唤起，说一句话就能打开设置、运行动作、管面板——并且越用越快。

**推荐 demo**（录屏 / 动作页）：

1. 「打开功能快捷键」— 展示 resolve-direct 速度
2. 「打开动作回收站」— 展示懂 Quicker 概念
3. 第二次说同样的话 — 展示 command cache 秒回
4. `@` 精确动作 + 运行 — 展示零歧义
5. 快捷键唤起 + 语音 — 展示多模态入口

**与竞品叙事**（内部文案参考）：

- vs Quicker 自带搜索：自然语言 + 消歧 + **可执行**
- vs Raycast / PowerToys Run：专精 Quicker 域（设置、trace、子程序）
- vs 主 Chat：不占屏、即来即走；复杂编写转主 Agent

---

## 13. 规划方向（未实现）

维护者可在此跟踪演进，**以代码为准**：

- [ ] 启动器文案测试（成功/失败/等待各一句）
- [ ] resolve 失败时 fallback「打开动作回收站」（动作已删等边界）
- [ ] 空状态可点击示例（对齐 tool-test 场景）
- [ ] 最近成功指令快捷重跑
- [ ] 唤起时后台 `qkrpc` 预热
- [ ] 语音结束自动提交 + TTS 短播报
- [ ] 复杂意图一键「转到主窗口继续」

---

## 14. 源文件索引

| 路径 | 职责 |
|------|------|
| `agent-gui/app/launcher/` | 小窗路由与布局 |
| `agent-gui/components/launcher/` | Composer、Transcript、DragRegion |
| `agent-gui/lib/launcher/launcher-bridge.ts` | BroadcastChannel 协议 |
| `agent-gui/lib/launcher/launcher-window.ts` | 打开弹窗 / Tauri show |
| `agent-gui/lib/launcher/launcher-cache-direct.server.ts` | Cache 直连响应 |
| `agent-gui/lib/launcher/launcher-resolve-direct.server.ts` | Resolve 直连响应 |
| `agent-gui/lib/launcher/launcher-resolve-core.ts` | RPC + preset 合并 |
| `agent-gui/lib/launcher/launcher-command-cache*.ts` | 缓存读写与工具 |
| `agent-gui/lib/chat-mode.ts` | 工具集与步数上限 |
| `agent-gui/lib/instructions.ts` | `LAUNCHER_SYSTEM_INSTRUCTIONS` |
| `agent-gui/app/api/chat/route.ts` | 直连短路 + chatMode 分支 |
| `agent-gui/components/chat/Chat.tsx` | 桥接订阅与 ephemeral 线程 |
| `agent-gui/components/chat/LauncherSettingsSection.tsx` | 设置 UI |
| `agent-gui/src-tauri/src/launcher.rs` | 浮窗 chrome / 定位 / show |
| `agent-gui/src-tauri/src/global_shortcut.rs` | 全局快捷键 |
| `QuickerRpc.Plugin/Services/LauncherResolveService.cs` | 插件侧统一 resolve |
| `QuickerRpc.Console/Program.Launcher.cs` | `qkrpc launcher resolve` |

---

## 15. 相关文档

- [agent-gui-prompt-structure.md](agent-gui-prompt-structure.md) — Launcher system 与 prompt 组装
- [agent-gui-chat-storage.md](agent-gui-chat-storage.md) — ephemeral 线程与 metadata 标记
- [agent-gui-plugin-storage.md](agent-gui-plugin-storage.md) — presets / cache 磁盘路径
- [agent-tool-granularity.md](agent-tool-granularity.md) — `LAUNCHER_TOOL_IDS` 设计说明
- [cli-commands.md](cli-commands.md) — `qkrpc launcher resolve`
- [agent-gui/README.md](../agent-gui/README.md) — 开发与 Tauri 发布

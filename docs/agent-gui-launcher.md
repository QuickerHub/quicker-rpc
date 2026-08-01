# QuickerAgent Launcher 契约

> 产品状态见 [LAUNCH](product/README.md#p-launch)。本文只维护会被代码或测试依赖的稳定契约。

## 产品边界

| 项目 | Launcher | 主窗口 |
|---|---|---|
| 唤起 | `CommandOrControl+Shift+Space` | 正常打开应用 |
| 会话 | 临时，不写常规聊天历史 | SQLite 持久化线程 |
| 工具 | `LAUNCHER_TOOL_IDS` | 用户启用工具与 TurnPlan bundle |
| 任务 | 快速运行、打开、查询和小修改 | 复杂编写、调试与长对话 |

桌面端默认 CommandOrControl+Shift+Space，配置 wire 值默认 `CommandOrControl+Shift+Space`。

## 执行顺序

```text
Electron globalShortcut -> /launcher
  -> command cache direct
  -> launcher resolve direct
  -> ToolLoopAgent (launcher tool set)
  -> bridge 同步结果/审批
```

- direct 只执行允许的、确定性且高置信步骤；失败回退统一 Agent 流程。
- `launcher_command_cache` 保存稳定的用户短语到工具步骤映射。
- `launcher_resolve` 负责快速候选解析，不替代通用工具选择。
- 一次只保留一个活动 Launcher run；新 run 会替换旧临时会话。

## 代码入口

| 范围 | 路径 |
|---|---|
| 页面/UI | `agent-gui/app/launcher/`、`components/launcher/` |
| 模式/工具 | `lib/chat-mode.ts` |
| 会话/桥接 | `lib/launcher/launcher-session.ts`、`launcher-bridge.ts` |
| direct | `launcher-cache-direct.server.ts`、`launcher-resolve-direct.server.ts` |
| Electron 窗口 | `electron/commands/launcher.mjs` |
| 快捷键 | `electron/commands/global-shortcut.mjs` |

`lib/launcher` 中带 Tauri 名称的文件是兼容遗留；当前正式桌面行为以 Electron commands 为准。

## 不变量

1. UI 与服务端不得各维护一份 Launcher 工具列表。
2. 关闭窗口时清理审批、录音和临时 session。
3. 快捷键录制期间暂停 Launcher 全局快捷键。
4. `/voice-chat` 的浏览器 TTS 不等于 Launcher 已支持结果播报。

## 验证

```powershell
cd agent-gui
pnpm test:launcher
pnpm test:agent-eval
```

窗口/快捷键修改还要在 Electron 开发态验证重复唤起、隐藏和重新注册。

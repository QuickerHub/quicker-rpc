# QuickerAgent 浏览器自动化边界

> 设计规格：`docs/superpowers/specs/2026-06-14-browser-automation-design.md`  
> 实现计划：`docs/superpowers/plans/2026-06-14-browser-automation-unification.md`

Agent 侧只有 **两个** 浏览器相关工具；第三种（Electron 内嵌）是 `browser` 的运行时模式，不是独立工具。

## 工具对照

| 工具 | 后端 | 登录态 | 何时用 |
|------|------|--------|--------|
| **`browser`** | Playwright 无头（默认）或 Electron 内嵌 | 独立 / Electron 分区 | 爬取、无登录页、`evaluate` 脚本；需在 App 内看页面时加 `showPanel: true` |
| **`user_browser`** | Quicker Connector 扩展 | **用户真实 cookie** | 已登录的 Chrome/Edge/Firefox、操作用户标签页 |

动作里的 **`sys:chromecontrol`** 属于 Quicker 动作运行时，不是聊天工具。

## 决策树

```
需要用户浏览器里已登录的会话？
  是 → user_browser
  否 → browser
         需要在 QuickerAgent 侧栏里看到页面？
           是 → browser + showPanel: true（Electron 内嵌）
           否 → browser（默认 Playwright 后台，最快）
```

## `browser` 参数（新增）

| 参数 | 默认 | 含义 |
|------|------|------|
| `target` | `auto` | `auto` \| `headless` \| `embedded` |
| `showPanel` | `false` | `true` 时打开侧栏内嵌浏览器（仅 Electron 环境） |

- **`target=auto`**：无 `showPanel` → Playwright；`showPanel` 或显式 `embedded` → 内嵌（不可用时回退 Playwright）。
- **`target=embedded`**：在内嵌 Chromium 后台跑脚本（与侧栏共用 profile），不自动开面板。
- **同一 `sessionId`**：侧栏手动浏览与 Agent 内嵌自动化共用 Electron profile（推荐，已采纳）。

## 环境

| 环境 | Playwright | 内嵌 | 扩展 |
|------|------------|------|------|
| Electron 壳 | ✅ | ✅ | ✅（需 Quicker + 插件） |
| 纯浏览器 dev (`:3000`) | ✅ | ❌（回退 Playwright） | ✅（需 Quicker） |
| 第三方 MCP | — | — | `qkrpc_chrome_*` |

## 端口（实现细节，Agent 不必记忆）

| 服务 | 端口 | 协议 |
|------|------|------|
| Playwright runtime | 6017 | `quicker-browser-v1` |
| Electron embedded | 6018 | `quicker-embedded-browser-v1` |
| Quicker 扩展 | — | `qkrpc chrome run` / `chrome.tabs` |

## 相关 Skill

- `quicker-chromecontrol` — 扩展与用户浏览器
- `quicker-browser-script` — 页面脚本 + trigger 流水线

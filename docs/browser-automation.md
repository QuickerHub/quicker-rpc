# QuickerAgent 浏览器自动化边界

> 本文是浏览器工具与运行时边界的当前权威说明。

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

## 取消边界

`browser` 继承当前 turn 的 AbortSignal，也接受 AI SDK 提供的显式 signal；显式 signal
只能缩小本次调用的生命期。已取消时不发起探测、session.ensure 或页面操作；运行中取消
会中止本次 HTTP 请求与等待，迟到响应不作为成功、不生成录制，也不回退到另一浏览器。
共享 runtime 的启动和其它调用继续由各自 owner 管理，取消单次工具不会关闭共享 session。

两个 runtime 的 HTTP 请求各持有独立 operation owner；连接异常断开会取消该 owner，正常
请求正文完成不视为取消。同一 session 的 invoke 串行执行，排队期间取消不会分发原生操作。
运行中取消会立即结束本次调用等待；每次原生等待结束后检查 owner，取消后不继续导航等待的
回退、evaluate、快照、预览或操作结果写入，也不保存该操作尚未执行的登录态写入。

已经发出的 Playwright click/evaluate、Electron executeJavaScript/loadURL 没有等价的安全撤销
接口，因此队列保留该 session 的 running 尾直到原生 promise 结束，防止下一项与迟到操作
重叠；原生操作一直不结束时，同 session 后续调用仍需等待，其他 session 不受影响。导航
超时也只取消本次 owner，不通过关闭共享页面解除队列。仅本次创建且尚未发布的 context
可由本次取消清理。已发生的网页副作用、实际页面事件及手动浏览不能回滚，不关闭用户浏览器
或共享 context 冒充取消完成。本边界由 fake transport/page/WebContents 回归验证，未以此
声称真实页面原生取消或端到端宿主验收已经完成。

## 相关 Skill

- `quicker-chromecontrol` — 扩展与用户浏览器
- `quicker-browser-script` — 页面脚本 + trigger 流水线

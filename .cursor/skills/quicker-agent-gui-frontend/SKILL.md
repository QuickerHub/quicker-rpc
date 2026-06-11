---
name: quicker-agent-gui-frontend
description: >-
  After editing agent-gui (Next.js), automatically run dev_frontend_check (or GET
  /api/dev/frontend-check) and fix until ok=true — no user reminder needed. Use when
  changing components/, app/, lib/ used by UI, globals.css, electron shell UI, /tool-test,
  or when the user asks about Next.js errors, HMR, Electron titlebar, or frontend smoke.
disable-model-invocation: false
metadata:
  internal: true
---

# agent-gui 前端：自动检查并修复

## 铁律（Agent 自执行，勿等用户提醒）

改动 **`agent-gui/**` 中会影响页面、样式或桌面壳 UI** 后，在声称「完成 / 已修复 / 通过」之前：

1. **必须**跑前端检查直到 **`ok: true`**（见下方命令）。
2. **`ok: false`** → 按 `issues[]` 与 `.local/*.json` 修源码 → 等待 Next 重编译 → 再跑，循环。
3. **禁止**：未跑检查就声称前端无错；仅改 UI 却跑根目录 `build.ps1 -t`；提交 `.local/*.json`。

与 [verification-before-completion](https://github.com/obra/superpowers) 一致：**先证据，后结论**。

## 何时触发本 skill

| 改动 | 必探测 `paths`（在默认之外追加） |
|------|----------------------------------|
| 任意主聊天 UI | 默认即可：`/`、`/api/llm`、`/api/ping` |
| `app/tool-test/**`、`components/tool-test/**` | `"/", "/tool-test"` |
| `electron/**` 影响主窗/无边框标题栏 | `"/", "/tool-test"`（Electron 常用测试页） |
| `components/browser/**`、嵌入浏览器 | `"/"` + 手动在 Electron 打开侧栏浏览器（检查无 `desktop:invoke` 抛错） |
| `lib/action-editor/**` | `"/"`；若改了设计器路由再加对应 path |
| 仅 `lib/*.server.ts`、API route | 默认 + 改动的 `/api/...` path |

默认探测路径定义于 `lib/dev-frontend-smoke.server.ts`：`["/", "/api/llm", "/api/ping"]`。

## 检查命令（按优先级）

### 1. QuickerAgent 聊天工具（首选）

```text
dev_frontend_check({})
dev_frontend_check({ paths: ["/", "/tool-test"] })
dev_frontend_check({ clearCaptured: true })   # 仅在上一次 ok=true 之后
```

### 2. HTTP（Cursor 无 MCP 工具、或脚本回退）

```powershell
# 默认路由
Invoke-RestMethod "http://127.0.0.1:3000/api/dev/frontend-check"

# 指定页面（逗号分隔，无空格）
Invoke-RestMethod "http://127.0.0.1:3000/api/dev/frontend-check?paths=/,/tool-test"

# 通过后清陈旧 HMR 误报
Invoke-RestMethod "http://127.0.0.1:3000/api/dev/frontend-check?clearCaptured=true"
```

`ok: false` 时 HTTP 状态为 **503**，body 含 `issues[]`。

### 3. 仓库命令

Cursor：**`/frontend-check`**（读 `.cursor/commands/frontend-check.md`）。

## 标准收尾流程

```
编辑 agent-gui 源码
    → sleep 3–8s（等 webpack/turbopack 编译）
    → dev_frontend_check({ paths: [...] })
    → ok=false ? 读 issues + .local 落盘 → 修复 → 重复
    → ok=true → dev_frontend_check({ clearCaptured: true })
    → 再向用户汇报
```

**前提**：`pwsh ./dev.ps1` 或 `pwsh ./dev.ps1 -Electron` 在跑，`NODE_ENV=development`。dev server 未起时先启动，**不要**用 `pnpm build` 代替日常验证。

## 已内置的捕获（无需手写探针）

| 来源 | 机制 | 落盘 |
|------|------|------|
| 浏览器运行时 | `DevErrorCapture` → `window.error` / `unhandledrejection` / `console.error` | `.local/frontend-client-errors.json` |
| Next 编译失败 | `start.mjs` 解析 dev 终端 | `.local/frontend-build-error.json` |
| 页面 HTML 错误 overlay | `runFrontendSmokeCheck` 解析 GET 响应 | 工具返回 `issues[]` |
| 最近一次结果 | — | `.local/frontend-smoke-last.json` |
| Dev server URL | — | `.local/dev-server.json` |

## 按 `issues[].kind` 分流

| kind | 常见原因 | 处理 |
|------|----------|------|
| `compile` | TS/JSX/CSS 语法、缺失 import | 读 `message`/`file`；查 `.local/frontend-build-error.json` |
| `runtime` | 客户端 throw、chunk 加载失败 | 查 `frontend-client-errors.json`；必要时硬刷新 Electron |
| `hydration` | SSR/CSR 不一致 | 对齐 server/client 渲染；查 Hooks 顺序 |
| `console` | `console.error` 被 DevErrorCapture 收录 | 修根因或去误报后 `clearCaptured` |
| `http` | 路由 4xx/5xx、dev server 未就绪 | 确认 `:3000` 存活； corrupt `.next` 时按 `start-agent-gui.ps1` 提示清缓存重启 |

**HMR 陈旧栈**：`issues` 指向已删模块 → `clearCaptured=true` → 刷新页面 → 再 check。

## 与 qkrpc / 插件构建的区别

| 改动范围 | 构建 |
|----------|------|
| 仅 `agent-gui/**`（UI / 页面 lib） | **本 skill**；勿 `build.ps1 -t` |
| `agent-gui/electron/**` 主进程 | 改完后重启 `dev.ps1 -Electron`；UI 仍用 `dev_frontend_check` |
| `agent-gui/llm-publish.config.json` | `quicker-agent-llm-apikey-config`；勿 `-t` |
| `QuickerRpc.Plugin` / `Console` / … | `quicker-rpc-build-test` / `build.ps1 -t` |

## 生产 / 发布

- `dev_frontend_check` 在 **`NODE_ENV=production` 不可用**。
- 用户明确要求或发布流程：`pnpm build`（勿在普通 UI 迭代会话中跑，会破坏 dev HMR 状态）。
- 发布前：`dev_frontend_check` ok + `pnpm electron:verify-bundle`（见 `agent-gui/AGENTS.md`）。

## 实现索引

- 工具：`lib/dev-frontend-check-tool.ts` → `tool-registry.ts`
- 探测：`lib/dev-frontend-smoke.server.ts`
- API：`app/api/dev/frontend-check/route.ts`
- 捕获：`components/dev/DevErrorCapture.tsx`、`lib/dev-frontend-error-store.server.ts`
- 约定：`agent-gui/AGENTS.md`、根 `AGENTS.md` Quick routing

## 相关 skill

- 动作设计器 UI：`quicker-action-designer-ui`（改完同样走本 skill）
- 插件热更新：`quicker-rpc-build-test`（**不要**与仅 UI 改动混用）

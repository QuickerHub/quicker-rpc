---
name: quicker-agent-gui-frontend
description: >-
  After editing agent-gui (Next.js), automatically capture compile/runtime errors
  via dev_frontend_check and fix until ok=true. Use when changing components/, app/,
  lib/ used by UI, globals.css, or when the user asks about Next.js errors, HMR,
  or frontend smoke check in agent-gui dev.
disable-model-invocation: false
metadata:
  internal: true
---

# agent-gui 前端：自动捕获 Next 报错并修复

## 已内置的捕获（开发模式，无需手写）

| 来源 | 机制 | 落盘 |
|------|------|------|
| 浏览器运行时 | `DevErrorCapture`（layout）→ `window.error` / `unhandledrejection` / `console.error` | `agent-gui/.local/frontend-client-errors.json` |
| Next 编译失败 | `start.mjs` 解析 dev 终端输出 | `agent-gui/.local/frontend-build-error.json` |
| 页面 HTML | `dev_frontend_check` 抓取错误页文案 | 工具返回 `issues[]` |
| 探测 URL | 默认 `/`、`/api/llm`、`/api/ping` | `agent-gui/.local/frontend-smoke-last.json` |

前提：`pnpm dev` / `start-agent-gui.ps1` 在跑，且 `NODE_ENV=development`。

## Agent 必做流程（改 UI 之后）

完成 **agent-gui/** 下会影响页面的修改后，**不要**只凭 HMR 假设无错；在**本机**循环：

1. 等待 Next 重新编译（通常数秒；可看终端或稍候再查）。
2. 调用聊天工具 **`dev_frontend_check`**（或 `GET /api/dev/frontend-check`），直到 **`ok: true`**。
3. 若 `ok: false`：读返回的 **`issues`**（含 `kind`、`message`、`file`/`line` 若有），改源码，回到步骤 1。
4. 页面已正常渲染后，再调一次 **`dev_frontend_check({ clearCaptured: true })`** 清空陈旧客户端/HMR 误报。

```text
# 工具参数示例（Agent 聊天内）
dev_frontend_check({})
dev_frontend_check({ clearCaptured: true })   # 仅在上一步 ok=true 后
dev_frontend_check({ paths: ["/", "/tool-test"] })  # 改过额外路由时
```

**禁止**：未跑 `dev_frontend_check` 就声称「前端已修好」；不要把 `.local/*.json` 提交进 Git。

## 与 qkrpc / 插件构建的区别

| 改动范围 | 构建 |
|----------|------|
| 仅 `agent-gui/**`（UI / lib 页面逻辑） | **不要** `build.ps1 -t`；用本 skill + `dev_frontend_check` |
| `agent-gui/llm-publish.config.json` | **不要** `-t`；用 `quicker-agent-gui-llm-publish-config`（`Sync-LlmPublishConfig.ps1`） |
| `QuickerRpc.Plugin` / `Console` / … | `.cursor/skills/quicker-rpc-build-test/SKILL.md`（`build.ps1 -t`） |

## 常见问题

- **HMR 陈旧栈**：`issues` 里路径指向旧模块 → `clearCaptured: true` 后刷新页面再 check。
- **工具测试页 /tool-test**：探测时加 `paths: ["/tool-test"]`。
- **生产构建**：`dev_frontend_check` 在 `NODE_ENV=production` 不可用；用 `pnpm build` 查编译错误。

## 相关

- Agent 约定：`agent-gui/AGENTS.md`（Frontend check、勿在会话中 `pnpm build`）
- 系统提示：`agent-gui/lib/instructions.ts`（`dev_frontend_check` 一行）
- 实现：`lib/dev-frontend-smoke.server.ts`、`lib/dev-frontend-check-tool.ts`、`components/dev/DevErrorCapture.tsx`
- 工具注册：`lib/tool-registry.ts` → `dev_frontend_check`
- 动作设计器 / step 字段编辑：`quicker-action-designer-ui`（`agent-gui/lib/action-editor/**`；对齐 `../Quicker/QuickerPc/Quicker` StepEditor）

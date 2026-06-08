# agent-gui — Agent Guidelines

> 嵌套 [AGENTS.md](../AGENTS.md)（距编辑文件最近者优先）。本目录为 QuickerAgent 前端（Next.js + Vercel AI SDK）。

## Project overview

Web 聊天界面，通过本机 `qkrpc serve`（`http://127.0.0.1:9477`）或 CLI 子进程与 Quicker 交互。系统提示：`lib/instructions.ts`（**通用 Agent** + [agentskills.io](https://agentskills.io/specification) 渐进披露）；Launcher 模式单独定义。Skill 加载：`lib/agent-skills/`；源码 `docs/skills/`；预加载 `quicker-authoring`。

## Dev environment tips

- **启动**（仓库根目录）：`pwsh ./start-agent-gui.ps1` → `http://127.0.0.1:3000`。桌面壳：`start-agent-gui.ps1 -Tauri`（webpack + WebView2）。
- **不要同时跑** 浏览器模式与 Tauri 模式（都占 `:3000`）。切换时脚本会清 `.next`。
- **后端依赖**：Quicker + 插件已加载；根目录 `build.ps1 -t` 负责插件/CLI/serve。**改本目录 UI 时不要跑 `-t`**（Next HMR 即可）。
- **qkrpc 连不上**：告知用户检查 Quicker / 插件 / serve；**禁止** `shell_exec` 探活或跑 `qkrpc` CLI / `build.ps1 -t`（见 `lib/instructions.ts`、`lib/shell-policy.ts`）。
- **包管理**：pnpm；Node 20+。日常只在 `agent-gui/` 内 `pnpm` 操作，勿在 agent 会话里对整个 monorepo 乱装依赖。
- **LLM API Key**：`llm-config.json` / `llm-dev.config.json` / `llm-publish.config.json`（均 gitignore）→ skill `quicker-agent-llm-apikey-config`。

## Use dev server, not production build

迭代 UI 时 **始终用 dev server**（`start-agent-gui.ps1` / `pnpm dev`），启用 HMR。

- **不要在 agent 会话中跑 `pnpm build`**（生产构建会把 `.next` 切到生产资源，破坏 dev 热更新状态）。
- 需要验证生产构建时，在用户明确要求或发布流程外单独执行；日常收尾用 **`dev_frontend_check`** 即可。

## Frontend check（改 UI 后必做）

完成会影响页面的修改后，**宣布完成前**循环检查直到通过：

1. 等待 Next 重新编译（数秒）。
2. **`dev_frontend_check`** 或 `GET http://127.0.0.1:3000/api/dev/frontend-check`，直到 **`ok: true`**。
3. **`ok: false`**：读 `issues[]`（`kind` / `message` / `file` / `line`）及 `.local/frontend-build-error.json`、`frontend-client-errors.json` → 修源码 → 回到步骤 1。
4. **`ok: true` 后**：再调 `dev_frontend_check({ clearCaptured: true })` 清空陈旧误报。
5. 改过 `/tool-test` 等路由：`dev_frontend_check({ paths: ["/", "/tool-test"] })`。

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/dev/frontend-check
```

| 捕获来源 | 落盘 |
|----------|------|
| `window.error` / `unhandledrejection` | `.local/frontend-client-errors.json` |
| Next 编译失败 | `.local/frontend-build-error.json` |
| HTTP 探测 `/`、`/api/llm`、`/api/ping` | 工具返回 `issues[]` |

**禁止**：仅改 `agent-gui/**` 却跑根目录 `build.ps1 -t`；把 `.local/*.json` 提交进 Git。

细则：`.cursor/skills/quicker-agent-gui-frontend/SKILL.md`。

## Action editor（`lib/action-editor/`）

双击 step 弹窗、各字段编辑行为须对齐桌面 Quicker：

- UI 设计来源：`../Quicker/Quicker.Designer`（`Quicker.Designer.Web`）
- 行为对照：`../Quicker/QuickerPc/Quicker` 的 `ActionDesignerWindow`、`View/X/StepEditor/**`
- Step-runner **UI** 用 `step-runner get-ui`；**Agent 工具禁止** get-ui，只用 `qkrpc_step_runner_get`

细则：`.cursor/skills/quicker-action-designer-ui/SKILL.md`。

## Testing & lint

- 日常：**`dev_frontend_check`** 为主（编译 + 关键路由 + 浏览器运行时）。
- 类型/ESLint：按需 `pnpm lint`（改组件 imports 或大 refactor 后）。
- Tauri 发布验证：`pnpm tauri:verify-bundle`（发布流程，非每次 UI 改动）。

## PR instructions

- Commit 格式（用户要求提交时）：`<type>(agent-gui): <subject>`。
- 合并前：`dev_frontend_check` 为 `ok: true`；勿包含 `llm-config.json` / `.local/`。
- Tauri 正式发布：`pnpm quicker-agent:publish`（仓库根目录）；见 [README.md](README.md)。

## Further reading

- [README.md](README.md) — 双模式开发、Tauri 发布、工具一览
- [docs/agent-gui-chat-storage.md](../docs/agent-gui-chat-storage.md) — 对话存储
- [docs/agent-gui-plugin-storage.md](../docs/agent-gui-plugin-storage.md) — 插件存储
- 根目录 [AGENTS.md](../AGENTS.md) — 热更新、qkrpc 无头编辑、集成测试

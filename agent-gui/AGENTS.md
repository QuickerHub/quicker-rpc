# agent-gui — Agent Guidelines

> 嵌套 [AGENTS.md](../AGENTS.md)（距编辑文件最近者优先）。热更新、`build.ps1 -t`、qkrpc 连通、无头编辑、正式发布见父文档。

Next.js + Vercel AI SDK；`qkrpc serve`（9477）或 CLI 子进程。系统提示：`lib/instructions.ts`；Launcher 单独；Skills：`lib/agent-skills/`、`docs/skills/`；预加载 `quicker-authoring`。

## Dev & build

- 启动（仓库根）：`pwsh ./dev.ps1` → `:3000`；`-Electron`（默认）/ `-Tauri`（legacy）。勿同时占 `:3000`；切壳清 `.next`。
- **改本目录 UI**：dev server + HMR；**禁** `pnpm build`、**禁** 根目录 `build.ps1 -t`。
- pnpm / Node 20+；LLM key：`llm-*-config.json`（gitignore）→ skill `quicker-agent-llm-apikey-config`。
- qkrpc 连不上：见父文档；**禁** `shell_exec` 探活（`lib/instructions.ts`、`lib/shell-policy.ts`）。

## Frontend check（改 UI 后必做 — Agent 自动执行）

改 `components/`、`app/`、`lib/`（UI）、`globals.css`、Electron 壳、`/tool-test` 后，**宣布完成前**循环直到 `ok: true`（skill `.cursor/skills/quicker-agent-gui-frontend/SKILL.md`，命令 `/frontend-check`）：

1. 等 Next 编译（3–8s）→ `dev_frontend_check` 或 `GET /api/dev/frontend-check?paths=…`
2. `ok: false` → 读 `issues[]`、`.local/frontend-build-error.json`、`frontend-client-errors.json`、`frontend-smoke-last.json` → 修 → 重复
3. `ok: true` → `dev_frontend_check({ clearCaptured: true })`

| 改动 | `paths` |
|------|---------|
| 主聊天 | `/`、`/api/llm`、`/api/ping` |
| `/tool-test`、标题栏 | `["/", "/tool-test"]` |
| 某 API | 默认 + 该 route |

**禁止**：未检查就声称无错；提交 `.local/*.json`。

## Action editor（`lib/action-editor/`）

对齐 `../Quicker/Quicker.Designer` UI、`../Quicker/QuickerPc/Quicker` 行为。Step-runner **UI** 用 `get-ui`；**Agent 禁 get-ui**，只用 `qkrpc_step_runner_get`。细则：skill `quicker-action-designer-ui`。

## Test & PR

- 日常 `dev_frontend_check`；大改后 `pnpm lint`；Electron 发布：`pnpm quicker-agent:publish` / `publish/Publish-QuickerAgent.ps1`。
- Commit：`<type>(agent-gui): <subject>`；合并前 `dev_frontend_check` ok。

## Docs

[README.md](README.md)、[../docs/agent-gui-chat-storage.md](../docs/agent-gui-chat-storage.md)、[../docs/agent-gui-launcher.md](../docs/agent-gui-launcher.md)、[../docs/agent-gui-startup-performance.md](../docs/agent-gui-startup-performance.md)、[../docs/agent-gui-plugin-storage.md](../docs/agent-gui-plugin-storage.md)

# agent-gui — Agent Guidelines

> 嵌套 [AGENTS.md](../AGENTS.md)（距编辑文件最近者优先）。热更新、`build.ps1 -t`、qkrpc 连通、无头编辑、正式发布见父文档。

默认生产为静态 React renderer + 独立 Node Agent service + 薄 Electron 壳，复用单一 Vercel AI SDK loop；Next 保留开发 HMR 与显式 legacy 生产入口。通过 `qkrpc serve`（9477）或 CLI 子进程访问宿主。系统提示：`lib/instructions.ts`；Launcher 单独；Skills：`lib/agent-skills/`、`docs/skills/`；预加载 `quicker-authoring`。

修改功能前先查 [产品任务路由](../docs/agents/README.md)，只读 [产品能力与规划](../docs/product/README.md) 中对应功能域。

## Dev & build

- 开发启动（仓库根）：`pwsh ./dev.ps1` → `:3000` HMR；桌面用 `-Electron`，Tauri 为显式 legacy。勿同时占 `:3000`；开发切壳仍由脚本处理 `.next`。
- **改本目录 UI**：使用 dev server + HMR 和前端检查，不以生产构建代替日常 UI 验收；**禁**为 UI 改动运行根目录 `build.ps1 -t`。只有生产构建/打包任务才运行下述生产入口。
- pnpm / Node 20+；LLM key：`llm-*-config.json`（gitignore）→ skill `quicker-agent-llm-apikey-config`。
- qkrpc 连不上：见父文档；**禁** `shell_exec` 探活（`lib/instructions.ts`、`lib/shell-policy.ts`）。

## 默认生产与显式 legacy

- `pnpm build` 默认生成文档、核对 API manifest、独立 TypeScript 检查，再构建静态 React/Node 到仓库 `.tmp/static-runtime/app`；不改 `.next`。
- `pnpm start` 默认在原 Node 进程加载该产物，固定生产模式，转发 `--port` / `--data-dir` 等服务参数；不在启动前先拉起 Next/qkrpc。验收用显式 data-dir 与临时端口。
- `pnpm electron:prepare` / `electron:build` 和 `publish/Publish-QuickerAgent.ps1` / build preflight 默认静态。`build:static` / `build:static:dev` 是底层/开发检查入口；`electron:prepare:static` 兼容入口保留。
- Next 生产只通过 `build:legacy-next`、`electron:prepare:legacy-next`、`electron:build:legacy-next`、`start:legacy-next` 或发布脚本的 `-RuntimeMode legacy-next` 显式选择。legacy start 读取完整 `electron/resources/app`，不能直接运行缺少 public/static 资源的 `.next/standalone`。
- `SkipAppBuild`（别名 `SkipNextBuild`）不切换模式：静态复用已 staged 且预检通过的 app；legacy 只省略 Next build，prepare 仍从已有 `.next/standalone` 重新 staging。
- 当前 shell 模式与资源 `runtime-mode.json` 不匹配、静态 manifest/入口缺件时，先报诊断再停止；不得隐式改用遗留 Next server，也不得把模式标记当作产物版本/完整升级证明。
- `pnpm check:service-routes` 防止 API manifest 漂移；handler 仍是 `app/api/` 的单一实现。
- `pnpm test:static-runtime` 使用生成资料、fake HTTP、独立 Edge 和真实本次 browser/terminal child，包含开发态 frontend check。
- 默认入口切换不表示安装/升级、真实旧资料、全局快捷键或完整宿主流程均已验收。资源/生命周期/验证边界见 [静态运行目录](../docs/engineering/static-agent-runtime.md)。

## Frontend check（改 UI 后必做 — Agent 自动执行）

改 `components/`、`app/`、`lib/`（UI）、`globals.css`、Electron 壳、`/tool-test` 后，**宣布完成前**循环直到 `ok: true`（skill `.cursor/skills/quicker-agent-gui-frontend/SKILL.md`，命令 `/frontend-check`）：

1. 等 Next 编译（3–8s）→ `dev_frontend_check` 或 `GET /api/dev/frontend-check?paths=…`
2. `ok: false` → 读 `issues[]`、`.local/frontend-build-error.json`、`frontend-client-errors.json`、`frontend-smoke-last.json` → 修 → 重复
3. `ok: true` → `dev_frontend_check({ clearCaptured: true })`

新 UI / CSS 默认适配深/浅主题：见 `.cursor/skills/quicker-agent-gui-theme/SKILL.md`（`--ad-*` / `theme.css`，勿硬编码 hex）。

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

[产品功能地图](../docs/product/README.md)、[任务路由](../docs/agents/README.md)、[Agent 架构](../docs/agent-architecture.md)、[README.md](README.md)。存储、Launcher 和插件文档只作为所属功能域的深参考。

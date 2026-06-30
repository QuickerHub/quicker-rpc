

> 遵循 [AGENTS.md 开放格式](https://agents.md)：面向 coding agent 的操作说明；人类贡献者请读 [README.md](README.md)。

Quicker 插件 + `qkrpc.exe` CLI，通过 **命名管道 + StreamJsonRpc** 让外部命令行调用 Quicker 内能力。

## Quick routing（改什么 → 做什么）

| 改了什么 | Agent 必做 | 不要 |
|----------|-----------|------|
| `QuickerRpc/src/**`、`QuickerRpc/build.yaml`、`QuickerRpc/version.json` | 根目录 `pwsh -NoProfile -File ./build.ps1 -t`（或 `/hot-update`）；**必须等构建日志出现 plugin runaction** | 只改代码不构建、让用户代跑、未重载就声称 Plugin 已修好 |
| `docs/action-authoring-src/**`、`build.ps1`、`build.yaml`、`publish/publish-rpc.ps1` | 同上 `-t` | — |
| 仅 `agent-gui/**` | **自动** `dev_frontend_check` 直到 `ok: true`（或 `/frontend-check`）；见 [quicker-agent-gui-frontend](.cursor/skills/quicker-agent-gui-frontend/SKILL.md) | 跑 `build.ps1 -t`；未检查就声称无错 |
| `agent-gui/llm-publish.config.json` 或用户说 **发布 publish config** | `publish/Sync-LlmPublishConfig.ps1` → `BUNDLED_LLM_CONFIG` + Bitiful 加密 OSS；skill `quicker-agent-llm-apikey-config` / `/publish-llm-config` | commit 该文件；勿 `-t` |
| `voice-asr-runtime/**` 发布 / 用户说 **voice runtime 发布** | `quicker-voice-runtime-publish` / `/publish-voice-runtime`；tag `vX.Y.Z` → 同步两处 `voice-plugin-channel.json` | 勿改 `version.json`；勿仅用 `-t` |
| 仅 `README.md`、`AGENTS.md`、`.cursor/**`（未动 C#） | 无构建 | — |
| `docs/agent-mcp-integration.md` 等纯文档 | 无构建 | — |
| 第三方 Agent 接入（MCP/skills） | **Agent 自执行** [docs/agent-mcp-self-install.md](docs/agent-mcp-self-install.md)；Cursor `qkrpc agent setup`；Codex `--codex --project` | 只把命令丢给用户 |
| 公开发布 / getquicker 正式包 | `/publish`；第三段 +1，见 [quicker-qkbuild-version-publish](.cursor/skills/quicker-qkbuild-version-publish/SKILL.md) | 仅用 `-t` revision 代替发布 |

**热更新后验证**：`Invoke-RestMethod http://127.0.0.1:9477/health` 或 `qkrpc action list --limit 1 --json`。

## Dev environment tips

- **前置**：Quicker 已运行且已加载 QuickerRpc 插件；**勿**先 `ping` 探活。
- **Shell 调 qkrpc / rg**：QuickerAgent 的 `shell_exec` 会在 spawn 时**自动**把 `qkrpc` 与 `rg`（ripgrep）目录 prepend 到 PATH（`agent-gui/lib/qkrpc-toolchain-env.mjs`、`agent-gui/lib/rg-bin.mjs`）；`qkrpc mcp install` 也会写入工作区 `.vscode/settings.json` 的 `terminal.integrated.env`。仍优先 qkrpc MCP 工具。
- **qkrpc 连不上时**：先 **`qkrpc_wait`** / `qkrpc wait --json`（或 MCP `qkrpc_wait`）轮询等待；仍失败则告知用户检查 Quicker / 插件。**禁止** shell 连环探活，除非用户明确要求修复环境。详见 skill **`quicker-rpc-knowledge`**（`docs/skills/quicker-rpc-knowledge/`）。
- **Cursor / MCP**：用 `qkrpc_health` 或 qkrpc 工具；勿用 shell 代替 qkrpc CLI。
- **`qkrpc` 是本机 CLI**（`qkrpc` / `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe`）。在终端 **直接调用** `qkrpc <子命令>`，不要当成只能由用户手动的文档。
- **自描述优先**：`qkrpc help --json`；写动作：`qkrpc guide get --topic authoring-workflow --json`。人类可读：[docs/cli-commands.md](docs/cli-commands.md)。
- **高频 / agent-gui**：优先 `qkrpc serve`（`http://127.0.0.1:9477`，`GET /health`）；未启动时 agent-gui 回退为 CLI 子进程。
- **SDK**：.NET 10（CLI）；Plugin 为 net472。`agent-gui` 需 Node 20+、pnpm。启动开发环境：`pwsh ./dev.ps1`（见 [agent-gui/AGENTS.md](agent-gui/AGENTS.md)、[docs/dev-supervisor-design.md](docs/dev-supervisor-design.md)）。
- **管道**：`QuickerRpc_Server_QRPC2026`（`QuickerRpcPipeNames.ServerPipe`）；插件 host server，CLI client connect。

## Build & hot-update

改 Plugin / CLI / Contracts / AgentModel 后 **不会** 自动生效；用户未说「不要 build」时，Agent 在仓库根目录执行：

```powershell
pwsh -NoProfile -File ./build.ps1 -t
```

作用：停旧 `qkrpc serve` → 编译测试包并更新 `QuickerRpc_Run` version 变量 → **等待 1s 后** `quicker:runaction` **重载插件 DLL** → 发布 CLI → 启新 serve（`9477`）。**未跑 `-t` 或未成功触发重载动作时，插件可能未加载，调试会像没修复一样。** `dev.ps1` 可保持运行。

细则：`.cursor/skills/quicker-rpc-build-test/SKILL.md`、`.cursor/commands/hot-update.md`。

## Testing instructions

| 项目 | 用途 |
|------|------|
| `QuickerRpc/tests/QuickerRpc.Plugin.Test` | 离线扫描 `Quicker.exe` 反射 |
| `QuickerRpc/tests/QuickerRpc.Test` | **活进程** RPC（需 Quicker + 插件；改 Plugin 后先 `-t`） |

```powershell
dotnet test QuickerRpc/tests/QuickerRpc.Test -c Release
dotnet test QuickerRpc/tests/QuickerRpc.Test -c Release --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests
dotnet test QuickerRpc/tests/QuickerRpc.Test -c Release --filter Rpc_GetCompressedAction_rpc_test_fixture
dotnet test QuickerRpc/tests/QuickerRpc.Test -c Release --filter FullyQualifiedName~QuickerRpcRpcContentTests
```

改 Plugin 相关断言前必须先 `build.ps1 -t` 并在 Quicker 重载 DLL。可选环境变量：`QUICKER_RPC_TEST_ACTION_ID`、`QUICKER_RPC_TEST_SHARED_ACTION_ID` 等（见原测试类注释）。

## Authoring actions（无头编辑）

**入口**：`qkrpc guide get --topic overview --json` → `authoring-workflow`（P1–P7）；公共子程序：`subprogram-workflow`；磁盘编辑：`workspace-editing`。

```powershell
qkrpc guide get --topic overview --json
qkrpc action list --query "<keyword>" --json
qkrpc action get --id <guid> --return-mode full --json
qkrpc step-runner search --query "关键词|english|sys:*" --json
qkrpc step-runner get --key <stepRunnerKey> [--control-field <value>] --json
qkrpc subprogram search --query "<keyword>" --json
qkrpc subprogram get --id <idOrName> --return-mode full --json
qkrpc fa search --query "<keyword>" --json
qkrpc action run --id <guid> [--param <text>] --trace --json
```

**agent-gui 改程序体**：统一 `workspace_program`（`read_data` / `edit_data` / `write_data` / `file_*` / `patch` / `diagnostics`），`target` = `action` | `global_subprogram` | `embedded_subprogram`。**禁止** Agent 使用内联 patch 或 CLI `--patch-file`。

**Step-runner 分工**

| 命令 / 工具 | 谁用 |
|-------------|------|
| `step-runner search` / `qkrpc_step_runner_search` | Agent：定 `key`、`controlField` |
| `step-runner get` / `qkrpc_step_runner_get` | **Agent 唯一**：压缩 schema、`inputParams` 键名 |
| `step-runner get-ui` | **仅 action-editor UI**；Agent **禁止** |

**禁止**：未 `step-runner get` 就猜 `inputParams`（wire 写法：`paramKey` / `paramKey.file` / `paramKey.var`）；未 `subprogram get/search` 就猜 `callIdentifier`；未 `fa search` 就猜图标；patch 写与目录 Default 相同的普通参数。表达式优先 **quicker-eval-expression** skill / `sys:evalexpression`；兜底见 `guide get --topic implementation-fallback`。

**运行**：agent-gui `qkrpc_action` 要步骤输出用 `debug`（等价 `--trace`），不要用 `run`。CLI 退出码 0=成功、1=失败；脚本加 `--json`。

完整命令表：[docs/cli-commands.md](docs/cli-commands.md)。

## Code conventions

- **范围**：最小正确 diff；不扩写无关代码；匹配周边命名与风格。
- **注释**：英文；只解释非显而易见逻辑。
- **Commit**（用户要求提交时）：`<type>(<scope>): <subject>`，例如 `fix(plugin): reconnect pipe after reload`。
- **测试**：仅在有意义的场景添加；改 Plugin 后跑相关 `QuickerRpc.Test` 过滤器。
- **反射 / Quicker 内部类型**：优先 `QuickerRpc/src/QuickerRpc.Plugin.V1/Reflection/`；探测流程见 [quicker-exe-type-probing](.cursor/skills/quicker-exe-type-probing/SKILL.md)。可选本机 `.ref/Quicker/`（gitignore）。

## PR & publish instructions

- **日常热更新**：`-t` 只递增 `QuickerRpc/version.json` **第四段** revision；**不能**代替 getquicker 正式包。
- **正式发布**：第三段 +1（`X.Y.Z.R` → `X.Y.(Z+1).0`）；`QuickerRpc/version.json` 只能递增。Cursor **`/publish`** → [quicker-rpc-publish](.cursor/skills/quicker-rpc-publish/SKILL.md)。
- **GitHub Release CLI**：`.\publish\Publish-GitHubRelease.ps1`；用户安装 [Releases](https://github.com/QuickerHub/quicker-rpc/releases/latest) 的 `qkrpc-win-x64-setup.exe`。
- **合并前**：相关 `dotnet test` 通过；改 agent-gui UI 则 `dev_frontend_check` 通过。

| 产物 | 路径 |
|------|------|
| CLI | `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe` |
| 插件 | `publish/plugin/QuickerRpc.Plugin.*.dll` |
| CLI 安装包 | `publish/qkrpc-{version}-win-x64-setup.exe` |

## Security & secrets

- **勿提交**：`agent-gui/llm-config.json`、`agent-gui/llm-publish.config.json`（含 API Key）、`agent-gui/.local/*.json`、`.env`、凭证文件。
- **shell_exec**：删除/写入类命令需用户确认；拒绝 `format`、`diskpart`、`curl | iex` 等危险模式（agent-gui 侧）。

## Modules

RPC 产品树：`QuickerRpc/`（打开 `QuickerRpc/QuickerRpc.slnx`）。`agent-gui/` 为独立产品。

| 项目 | 职责 |
|------|------|
| `QuickerRpc/src/QuickerRpc.AgentModel` | XAction 压缩/patch、StepRunner；`docs/action-authoring-src/` → CLI 嵌入 |
| `QuickerRpc/src/QuickerRpc.Contracts` | `IQuickerRpcService` wire DTO（无 StreamJsonRpc） |
| `QuickerRpc/src/QuickerRpc.Transport` | 命名管道 + `QuickerRpcClient` / `QuickerRpcServerHost` |
| `QuickerRpc/src/QuickerRpc.Runtime` | `QuickerRpcService` 编排 + ActionProgram/SubProgram handlers |
| `QuickerRpc/src/QuickerRpc.Plugin.V1` | net472 插件：V1 host adapters + DI + WPF scheduler（输出 DLL 名仍为 `QuickerRpc.Plugin`） |
| `QuickerRpc/src/QuickerRpc.Plugin.V2` | net10 插件（反射 V2 宿主）；`build.net10.yaml` → `quicker.rpc.net10` |
| `QuickerRpc/src/QuickerRpc.Console` | `qkrpc.exe` |
| `QuickerRpc/lib/Quicker.ActionRuntime` | Console 编译依赖（子模块） |
| `agent-gui/` | Next.js + AI SDK；见 [agent-gui/AGENTS.md](agent-gui/AGENTS.md) |

## Cursor skills & commands

| 场景 | Skill / 命令 |
|------|----------------|
| qkrpc 连不上 / 术语与架构 | `quicker-rpc-knowledge`（`docs/skills/quicker-rpc-knowledge/`） |
| `$=` / evalexpression / 多变量赋值 | `quicker-eval-expression`（`docs/skills/quicker-eval-expression/`） |
| 热更新 | `quicker-rpc-build-test` / `/hot-update` |
| agent-gui UI / 前端自动检查 | `quicker-agent-gui-frontend` / `/frontend-check` |
| agent-gui 主题 / 新组件样式 | `quicker-agent-gui-theme`（`--ad-*`、`theme.css`） |
| 动作设计器字段 | `quicker-action-designer-ui`（对齐 `../Quicker/QuickerPc/Quicker`） |
| LLM API Key / 发布 publish config | `quicker-agent-llm-apikey-config` / `/publish-llm-config` |
| voice-asr runtime 发布 | `quicker-voice-runtime-publish` / `/publish-voice-runtime` |
| 动作页说明 | `quicker-action-doc` |
| 正式发布 | `quicker-rpc-publish` + `quicker-qkbuild-version-publish` / `/publish` |

## Further reading

- [README.md](README.md) — 安装、架构、人类快速开始
- [docs/README.md](docs/README.md) — 文档总索引（按角色选入口）
- [docs/ROADMAP.md](docs/ROADMAP.md) — QuickerAgent 路线图
- [agent-gui/README.md](agent-gui/README.md) — QuickerAgent 开发与发布
- [docs/quicker-agent.md](docs/quicker-agent.md) — QuickerAgent 产品说明
- [docs/agent-mcp-integration.md](docs/agent-mcp-integration.md) — 第三方 Agent MCP 接入
- [docs/quicker-action-data-storage.md](docs/quicker-action-data-storage.md) — 动作数据存储
- 插件加载：`load {packagePath}/QuickerRpc.Plugin.{M.m.b.r}.dll`；`QuickerRpc_Run` → `依赖下载_混合模式` 按四段版本取最高 DLL
- 插件监控窗：`QuickerAgent.Start`（`%%7d6999ed-93a1-4db0-9763-5405066199ac`）→ `QuickerRpc_Run`；Extern 仅 RPC 且弹版本提示
